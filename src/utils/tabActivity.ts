import type { ChatMessage } from '@/types/agentd.type'
import {
  isOpeningPrompt,
  openingPromptsAfter,
  turnMessagesOf,
  type ChatTabState
} from '@/utils/chatTab'
import { liveActivityOf } from '@/utils/liveStream'
import { askReasonOf, type NotifyReason } from '@/utils/notifications'
import {
  AGENT_TOOL_NAMES,
  isListed,
  timeOf,
  type AgentNotice,
  type BackgroundTasks
} from '@/utils/tabInsights'
import { isTaskTool } from '@/utils/toolKind'
import { isShellTool } from '@/utils/toolOutput'
import { resultTextOf, resultsByToolId, type ToolResultBlock } from '@/utils/toolPairs'
import { summarizeToolInput } from '@/utils/toolSummary'

/** The finished calls the panel lists under the one in progress. */
export const RECENT_TOOLS = 3
/** Tools that end a background shell by its task id: today `TaskStop`, before that `KillShell`. */
const SHELL_STOP_TOOL_NAMES = ['TaskStop', 'KillShell', 'KillBash']
/**
 * `Command running in background with ID: brl2ycy6y. Output is being written to: …`, or for a call
 * sent there while it ran (its timeout, Ctrl+B) `… was moved to the background (ID: beugxf82k)`.
 */
const BACKGROUND_ID_PATTERN = /^Command running in background with ID:\s*([\w-]+)/
/** Only Claude Code's own sentence at the start of the result, never a line a command printed. */
const MOVED_ID_PATTERN =
  /^Command [^\n]*?(?:moved to the background|backgrounded)[^\n]*?\bID:\s*([\w-]+)/

export const toolRunStatusList = ['running', 'done', 'failed', 'stopped'] as const
export type ToolRunStatus = (typeof toolRunStatusList)[number]

/** One tool call of a turn, as the panel lists it. */
export interface ToolRun {
  id: string
  name: string
  target: string
  status: ToolRunStatus
  /** ms since epoch; `null` when the message carried no time */
  startedAt: number | null
  finishedAt: number | null
}

export interface TurnSummary {
  /** Tool calls without the task tools, as the panel lists them */
  tools: number
  /** Every tool call, task tools (TodoWrite, TaskCreate …) included */
  calls: number
  subagents: number
  /** From the prompt to Claude's last message; `null` without times */
  durationMs: number | null
  /** ms since epoch of Claude's last message; `null` without times */
  endedAt: number | null
}

/** What the "now" card of the panel shows. */
export type ActivityState =
  | { kind: 'waiting'; reason: NotifyReason; tool: string; target: string }
  | { kind: 'running'; current: ToolRun | null; phase: 'thinking' | 'writing' | 'working' }
  | { kind: 'idle'; summary: TurnSummary | null }

/** The tool calls of the shown turn; changes with the messages, not with every streamed token. */
export interface TurnTools {
  /** Every tool call of the turn, oldest first */
  tools: ToolRun[]
  /** The newest finished calls, newest first */
  recent: ToolRun[]
  /** `null` while the turn runs: a running turn shows what happens now instead */
  summary: TurnSummary | null
}

export interface TabActivityView extends Pick<TurnTools, 'tools' | 'recent'> {
  state: ActivityState
}

/** A shell Claude started with `run_in_background` that has not ended yet. */
export interface BackgroundShell {
  id: string
  command: string
  /** What the shell is for: the stream's task name, else the call's `description`; may be empty */
  description: string
  startedAt: number | null
}

/** What the turn derivations read of a tab. */
type TurnSource = Pick<ChatTabState, 'messages' | 'turn' | 'status' | 'pending'>
/** What the per-prompt panel lists read: the turn, and the one a limit or move cut off. */
type PromptTurnSource = TurnSource & Pick<ChatTabState, 'cutTurn'>

const toolCallsOf = (messages: ChatMessage[]) =>
  messages.flatMap((message) =>
    message.blocks.flatMap((block) =>
      block.type === 'tool_use' ? [{ block, at: timeOf(message) }] : []
    )
  )

const isBusy = (tab: TurnSource): boolean => tab.status === 'working' || tab.status === 'asking'

/**
 * A prompt went out while Claude still starts: it waits in `pending` until Claude's first event,
 * but for the user its turn has begun, and the last turn is no longer the one to show.
 */
const isStartingTurn = (tab: Pick<ChatTabState, 'status' | 'pending'>): boolean =>
  tab.status === 'starting' && tab.pending.length > 0

/**
 * The turn the panel describes: the running one, or else the last one, which starts after the
 * newest prompt that opened a turn (a prompt typed mid-turn belongs to the turn it joined).
 */
export const shownTurnOf = (
  tab: TurnSource
): { messages: ChatMessage[]; startedAt: number | null } => {
  if (tab.turn) return { messages: turnMessagesOf(tab), startedAt: tab.turn.startedAt }
  if (isStartingTurn(tab)) return { messages: [], startedAt: null }
  const start = tab.messages.findLastIndex(isOpeningPrompt)
  const prompt = tab.messages[start]
  return {
    messages: tab.messages.slice(start + 1),
    startedAt: prompt ? timeOf(prompt) : null
  }
}

/**
 * The turn the user asked for: like `shownTurnOf`, but a turn Claude starts on its own to answer
 * a background agent's report stays part of the prompt before it, so the panel does not empty
 * while Claude replies to a report nobody typed.
 */
export const promptTurnOf = (
  tab: PromptTurnSource
): { messages: ChatMessage[]; startedAt: number | null } =>
  continuedTurnOf(tab) ?? shownTurnOf(tab.turn?.isAgentReply ? { ...tab, turn: null } : tab)

/**
 * The turn a limit or an account move cut off, while the one prompt after the cut continues it:
 * from its prompt to now, the continuation included. `null` without a cut, or once a further
 * prompt started something new.
 */
const continuedTurnOf = (
  tab: PromptTurnSource
): { messages: ChatMessage[]; startedAt: number | null } | null => {
  const cut = tab.cutTurn
  if (!cut) return null
  const start = tab.messages.findIndex((message) => message.uuid === cut.promptUuid)
  const prompt = tab.messages[start]
  if (!prompt || openingPromptsAfter(tab, start) > cut.promptsAfter + 1) return null
  return { messages: tab.messages.slice(start + 1), startedAt: timeOf(prompt) }
}

/**
 * The tool calls of a turn, without the task tools (they feed the steps list, not a tool card).
 * A call without a result runs while the turn does and was cut off once it ended.
 */
export const toolRunsOf = (messages: ChatMessage[], isRunning: boolean): ToolRun[] => {
  const results = new Map<string, { isError: boolean; at: number | null }>()
  for (const message of messages)
    for (const block of message.blocks)
      if (block.type === 'tool_result')
        results.set(block.tool_use_id, { isError: block.is_error, at: timeOf(message) })
  return toolCallsOf(messages)
    .filter(({ block }) => !isTaskTool(block.name))
    .map(({ block, at }) => {
      const result = results.get(block.id)
      const status: ToolRunStatus = result
        ? result.isError
          ? 'failed'
          : 'done'
        : isRunning
          ? 'running'
          : 'stopped'
      return {
        id: block.id,
        name: block.name,
        target: summarizeToolInput(block.input),
        status,
        startedAt: at,
        finishedAt: result?.at ?? null
      }
    })
}

const summaryOf = (
  messages: ChatMessage[],
  tools: ToolRun[],
  startedAt: number | null
): TurnSummary | null => {
  if (!messages.length) return null
  const endedAt = messages.map(timeOf).findLast((at) => at !== null) ?? null
  return {
    tools: tools.length,
    calls: toolCallsOf(messages).length,
    subagents: tools.filter((tool) => AGENT_TOOL_NAMES.includes(tool.name)).length,
    durationMs: startedAt !== null && endedAt !== null ? Math.max(0, endedAt - startedAt) : null,
    endedAt
  }
}

/** The calls of the shown turn and, once it is over, its summary. Reads messages, turn, status. */
export const turnToolsOf = (tab: TurnSource): TurnTools => {
  const { messages, startedAt } = shownTurnOf(tab)
  const isRunning = isBusy(tab) || isStartingTurn(tab)
  const tools = toolRunsOf(messages, isRunning)
  const recent = tools
    .filter((tool) => tool.status !== 'running')
    .slice(-RECENT_TOOLS)
    .reverse()
  return { tools, recent, summary: isRunning ? null : summaryOf(messages, tools, startedAt) }
}

/** The "now" card: cheap, so it may follow every streamed token. */
export const activityStateOf = (tab: ChatTabState, turn: TurnTools): ActivityState => {
  if (tab.permission) {
    const { toolName, input } = tab.permission
    return {
      kind: 'waiting',
      reason: askReasonOf(toolName),
      tool: toolName,
      target: summarizeToolInput(input)
    }
  }
  if (isStartingTurn(tab)) return { kind: 'running', current: null, phase: 'thinking' }
  if (tab.status !== 'working') return { kind: 'idle', summary: turn.summary }
  const live = liveActivityOf(tab.live)
  if (live) return { kind: 'running', current: null, phase: live }
  const current = turn.tools.findLast((tool) => tool.status === 'running') ?? null
  return { kind: 'running', current, phase: 'working' }
}

/** Everything the panel's "Aktivität" needs about one tab. */
export const tabActivityOf = (tab: ChatTabState): TabActivityView => {
  const turn = turnToolsOf(tab)
  return { state: activityStateOf(tab, turn), tools: turn.tools, recent: turn.recent }
}

const stoppedTaskIdsOf = (
  calls: ReturnType<typeof toolCallsOf>,
  results: Map<string, ToolResultBlock>
): string[] =>
  calls.flatMap(({ block }) => {
    if (!SHELL_STOP_TOOL_NAMES.includes(block.name)) return []
    // A stop that failed or has no answer yet ended nothing.
    const result = results.get(block.id)
    if (!result || result.is_error) return []
    const input = block.input as { task_id?: unknown; shell_id?: unknown }
    const taskId = input.task_id ?? input.shell_id
    return typeof taskId === 'string' ? [taskId] : []
  })

/**
 * Background shells still running. One starts with a Bash or PowerShell call with
 * `run_in_background`, whose result names its task id. It ends with a task notification (live a
 * `system`/`task_notification` event with the call id, see `agentNoticesOf`), a successful
 * `TaskStop`/`KillShell` on that task id, or when the stream's task list (`tasks`, from
 * `background_tasks_changed`) no longer names it. Once Claude has exited, none can run any more.
 * The list alone would not do: it only comes live, and a reload has none until the next change.
 */
export const backgroundShellsOf = (
  messages: ChatMessage[],
  notices: AgentNotice[],
  isLive: boolean,
  tasks: BackgroundTasks | null = null
): BackgroundShell[] => {
  if (!isLive) return []
  const results = resultsByToolId(messages)
  const calls = toolCallsOf(messages)
  const ended = new Set([
    ...notices.map((notice) => notice.id),
    ...stoppedTaskIdsOf(calls, results)
  ])
  return calls.flatMap(({ block, at }) => {
    if (!isShellTool(block.name)) return []
    const result = results.get(block.id)
    if (!result || result.is_error || ended.has(block.id)) return []
    // Started there or moved there while it ran: either way its result names the task.
    const text = resultTextOf(result).trimStart()
    const taskId =
      block.input.run_in_background === true
        ? text.match(BACKGROUND_ID_PATTERN)?.[1]
        : text.match(MOVED_ID_PATTERN)?.[1]
    if (!taskId || ended.has(taskId) || (tasks && !isListed(tasks, taskId))) return []
    const command = typeof block.input.command === 'string' ? block.input.command : ''
    const ownDescription =
      typeof block.input.description === 'string' ? block.input.description.trim() : ''
    const listed = tasks?.active.find((task) => task.id === taskId)?.description
    return [
      {
        id: block.id,
        command: command.split('\n')[0] ?? '',
        description: listed || ownDescription,
        startedAt: at
      }
    ]
  })
}
