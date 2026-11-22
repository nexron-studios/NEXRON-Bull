import type { Block, ChatMessage, ClaudeEvent } from '@/types/agentd.type'
import { ALL_PERCENT, percentOf } from '@/utils/percent'

/** Claude Code's context window without the 1M beta. */
export const DEFAULT_CONTEXT_WINDOW = 200_000
export const LARGE_CONTEXT_WINDOW = 1_000_000
const LARGE_CONTEXT_MARKER = '[1m]'
/** The tools that start a subagent: `Agent` today, `Task` before. */
export const AGENT_TOOL_NAMES = ['Agent', 'Task']

/** What a context is made of, in the order it is read: cache read, cache written, new. */
export const contextPartList = ['cached', 'written', 'fresh'] as const
export type ContextPart = (typeof contextPartList)[number]

export interface ContextUsage {
  /** Tokens the last call sent: fresh input plus both cache directions */
  tokens: number
  window: number
  model: string
  /** What the context is made of, from the same call */
  split: Record<ContextPart, number>
}

export const subagentStatusList = ['running', 'done', 'failed'] as const
export type SubagentStatus = (typeof subagentStatusList)[number]

export interface Subagent {
  /** The Agent tool call id; the stream tags the subagent's own turns with it */
  id: string
  title: string
  /** `general-purpose`, `Explore`, … */
  agentType: string
  isBackground: boolean
  /** The id its start answer names (`agentId: …`); its own transcript is filed under it */
  agentId: string | null
  status: SubagentStatus
  /** ms since epoch; `null` when the message carried no time */
  startedAt: number | null
  finishedAt: number | null
}

/** The background tasks (shells, agents) the stream last listed as running. */
export interface BackgroundTasks {
  /** Task ids: the id a shell's start answer names, the `agentId` of an agent */
  ids: string[]
  /** When the list arrived (ms since epoch) */
  at: number
}

/** A background agent's end, from Claude's `<task-notification>`. */
export interface AgentNotice {
  /** The Agent call id or the agent id from its start answer */
  id: string
  status: Exclude<SubagentStatus, 'running'>
  at: number
}

export const connectorStatusList = ['connected', 'pending', 'needs-auth', 'failed'] as const
export type ConnectorStatus = (typeof connectorStatusList)[number] | 'unknown'

/** An MCP server of the session as Claude Code reports it at start. */
export interface Connector {
  name: string
  status: ConnectorStatus
}

/** When a message was written or arrived (ms since epoch); `null` without a usable time. */
export const timeOf = (message: ChatMessage): number | null =>
  message.at ? Date.parse(message.at) || null : null

/** The context of the newest reply; `knownWindow` comes from the last result, when there is one. */
export const contextOf = (
  messages: ChatMessage[],
  knownWindow: number | null
): ContextUsage | null => {
  // The last reply that carries usage is the current context.
  const usage = messages.findLast((message) => message.usage)?.usage
  if (!usage) return null
  const tokens = usage.input + usage.cache_read + usage.cache_write
  const isLarge = usage.model.includes(LARGE_CONTEXT_MARKER) || tokens > DEFAULT_CONTEXT_WINDOW
  return {
    tokens,
    window: knownWindow ?? (isLarge ? LARGE_CONTEXT_WINDOW : DEFAULT_CONTEXT_WINDOW),
    model: usage.model,
    split: { cached: usage.cache_read, written: usage.cache_write, fresh: usage.input }
  }
}

/** The window Claude Code reports with each result (`modelUsage.<model>.contextWindow`). */
export const contextWindowOf = (result: ClaudeEvent): number | null => {
  const models = result.modelUsage as Record<string, { contextWindow?: number }> | undefined
  const windows = Object.values(models ?? {}).flatMap((model) => model.contextWindow ?? [])
  return windows.length ? Math.max(...windows) : null
}

const connectorListOf = (servers: { name?: string; status?: string }[]): Connector[] => {
  const known = new Set<string>(connectorStatusList)
  return servers
    .filter((server) => server.name)
    .map((server) => ({
      name: server.name as string,
      status: known.has(server.status ?? '') ? (server.status as ConnectorStatus) : 'unknown'
    }))
}

/** `system/init` lists the session's MCP servers; any other event gives `null`. */
export const connectorsOf = (event: ClaudeEvent): Connector[] | null => {
  if (event.type !== 'system' || event.subtype !== 'init') return null
  return connectorListOf((event.mcp_servers ?? []) as { name?: string; status?: string }[])
}

/** A server entry Claude sent as an object with a name; anything else is skipped. */
const isNamedServer = (value: unknown): value is { name: string; status?: string } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { name?: unknown }).name === 'string'

/** Claude's answer to the control request `mcp_status`: `{ mcpServers: [{ name, status }] }`. */
export const connectorsOfStatus = (response: unknown): Connector[] => {
  const servers = (response as { mcpServers?: unknown } | null)?.mcpServers
  if (!Array.isArray(servers)) return []
  return connectorListOf(servers.filter(isNamedServer))
}

const between = (text: string, tag: string): string | null =>
  text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]?.trim() ?? null

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((part: { text?: string }) => part.text ?? '').join('\n')
      : ''

/**
 * The ids of the background tasks still running, from the stream's `system` event of subtype
 * `background_tasks_changed`, which lists all of them on every change. `null` for any other event.
 * Live only: after a reload there is no list until the next change.
 */
export const backgroundTaskIdsOf = (event: ClaudeEvent): string[] | null => {
  if (event.type !== 'system' || event.subtype !== 'background_tasks_changed') return null
  if (!Array.isArray(event.tasks)) return null
  return (event.tasks as { task_id?: unknown }[]).flatMap((task) =>
    typeof task.task_id === 'string' ? [task.task_id] : []
  )
}

const COMPLETED = 'completed'

const noticeStatusOf = (status: unknown): AgentNotice['status'] =>
  status === COMPLETED ? 'done' : 'failed'

/**
 * A background agent or shell ended. The live stream says so with a `system` event of subtype
 * `task_notification` (`tool_use_id`, `task_id`, `status`; Claude Code 2.1.3xx); the
 * `<task-notification>` user turn Claude reads is not echoed live. Older versions sent that turn,
 * and agentd passes it through raw because it is no chat message, so both are read.
 */
export const agentNoticesOf = (event: ClaudeEvent, now: number): AgentNotice[] => {
  if (event.type === 'system' && event.subtype === 'task_notification') {
    const id = event.tool_use_id ?? event.task_id
    return typeof id === 'string' ? [{ id, status: noticeStatusOf(event.status), at: now }] : []
  }
  if (event.type !== 'user') return []
  const text = textOf((event.message as { content?: unknown } | undefined)?.content)
  if (!text.includes('<task-notification>')) return []
  const id = between(text, 'tool-use-id') ?? between(text, 'task-id')
  if (!id) return []
  return [{ id, status: noticeStatusOf(between(text, 'status')), at: now }]
}

export const AGENT_ID_PATTERN = /agentId:\s*([\w-]+)/
/** Claude Code also sends agents to the background on its own, without `run_in_background`. */
const ASYNC_AGENT_PATTERN = /^Async agent launched/

const resultText = (blocks: Block[]): string =>
  blocks.map((block) => (block.type === 'text' ? block.text : '')).join('\n')

/**
 * Subagents of a tab, oldest first. A background agent runs until its notice arrives or the
 * stream's task list (`tasks`) no longer names it; once Claude has exited (`isLive` false) nothing
 * can run any more, and a notice lost to a restart reads as done.
 */
export const subagentsOf = (
  messages: ChatMessage[],
  notices: AgentNotice[],
  isLive: boolean,
  tasks: BackgroundTasks | null = null
): Subagent[] => {
  const results = new Map<string, { isError: boolean; at: number | null; text: string }>()
  for (const message of messages)
    for (const block of message.blocks)
      if (block.type === 'tool_result')
        results.set(block.tool_use_id, {
          isError: block.is_error,
          at: timeOf(message),
          text: resultText(block.content)
        })
  const noticeOf = new Map(notices.map((notice) => [notice.id, notice]))

  return messages.flatMap((message) =>
    message.blocks.flatMap((block): Subagent[] => {
      if (block.type !== 'tool_use' || !AGENT_TOOL_NAMES.includes(block.name)) return []
      const input = block.input as {
        description?: string
        subagent_type?: string
        run_in_background?: boolean
      }
      const result = results.get(block.id)
      const isBackground =
        input.run_in_background === true || ASYNC_AGENT_PATTERN.test(result?.text ?? '')
      const agentId = result?.text.match(AGENT_ID_PATTERN)?.[1]
      const notice = noticeOf.get(block.id) ?? (agentId ? noticeOf.get(agentId) : undefined)
      const base = {
        id: block.id,
        title: input.description ?? '',
        agentType: input.subagent_type ?? 'general-purpose',
        isBackground,
        agentId: agentId ?? null,
        startedAt: timeOf(message)
      }
      if (result?.isError) return [{ ...base, status: 'failed', finishedAt: result.at }]
      if (isBackground && notice) return [{ ...base, status: notice.status, finishedAt: notice.at }]
      // A notice lost to a reload: the stream's task list no longer names the agent.
      if (isBackground && agentId && tasks && !tasks.ids.includes(agentId))
        return [{ ...base, status: 'done', finishedAt: tasks.at }]
      if (!isBackground && result) return [{ ...base, status: 'done', finishedAt: result.at }]
      return [{ ...base, status: isLive ? 'running' : 'done', finishedAt: null }]
    })
  )
}

/**
 * The panel's subagents (21.11.2026: the list starts over with every prompt, like
 * "Aktivität"): those the turn started, plus older background agents still running or finished
 * during it, so the user sees them end. An older foreground agent without a result was cut off by
 * a stop, it does not run on.
 */
export const turnSubagentsOf = (
  subagents: Subagent[],
  turn: { messages: ChatMessage[]; startedAt: number | null }
): Subagent[] => {
  const startedThisTurn = new Set(
    turn.messages.flatMap((message) =>
      message.blocks.flatMap((block) => (block.type === 'tool_use' ? [block.id] : []))
    )
  )
  const hasEndedDuringTurn = (agent: Subagent) =>
    turn.startedAt !== null && agent.finishedAt !== null && agent.finishedAt >= turn.startedAt
  return subagents.filter(
    (agent) =>
      startedThisTurn.has(agent.id) ||
      (agent.isBackground && (agent.status === 'running' || hasEndedDuringTurn(agent)))
  )
}

const shownModelFamilyList = ['opus', 'sonnet', 'haiku'] as const
export type ShownModelFamily = (typeof shownModelFamilyList)[number]

/** How full the context is, 0…100. */
export const contextPercentOf = (context: ContextUsage): number =>
  Math.min(ALL_PERCENT, Math.round(percentOf(context.tokens, context.window)))

/** `claude-haiku-4-5-20251001` → `haiku`; `null` for a model outside the three families. */
export const modelFamilyOf = (model: string): ShownModelFamily | null =>
  shownModelFamilyList.find((family) => model.toLowerCase().includes(family)) ?? null

/** How long a subagent ran or has been running (ms); `null` without a start time. */
export const subagentDurationOf = (agent: Subagent, now: number): number | null =>
  agent.startedAt === null ? null : Math.max(0, (agent.finishedAt ?? now) - agent.startedAt)
