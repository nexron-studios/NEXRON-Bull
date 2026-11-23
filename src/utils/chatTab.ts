import type { AgentdEvent, ChatMessage, ClaudeEvent, LimitState } from '@/types/agentd.type'
import type { ApiRetry } from '@/utils/apiRetry'
import { suggestionsOf, type PermissionUpdate } from '@/utils/approval'
import { isAgentMessage, withAgentTitles } from '@/utils/agentMessages'
import { isPromptEcho, withoutEchoed } from '@/utils/pendingPrompts'
import { withReportedSettings } from '@/utils/sessionSettings'
import type { LiveSubagents } from '@/utils/subagentActions'
import {
  connectorsOf,
  contextWindowOf,
  type AgentNotice,
  type BackgroundTasks,
  type Connector
} from '@/utils/tabInsights'

export const tabStatusList = ['starting', 'idle', 'working', 'asking', 'ended'] as const
export type TabStatus = (typeof tabStatusList)[number]

/** A turn in progress, waiting for the user, or Claude still starting: not done yet. */
export const isBusyStatus = (status: TabStatus): boolean =>
  status === 'working' || status === 'asking' || status === 'starting'

const TITLE_CHARS = 48
/** Background agents rarely run more than a handful at once; older notices only cost memory. */
export const MAX_AGENT_NOTICES = 50

/**
 * Where the transcript of a tab stands. A new session starts `loaded`: there is nothing to read.
 * A resumed or restored one starts `none` until the pane asks for it.
 */
export const historyStateList = ['none', 'loading', 'loaded', 'failed'] as const
export type HistoryState = (typeof historyStateList)[number]

export interface RunningTurn {
  /** When it started here (ms), for the elapsed time */
  startedAt: number
  /** The last message before it, so the pane knows whether Claude has replied yet */
  afterUuid: string | null
  /**
   * Claude answers another agent's message (a subagent's report), not the user: the work goes on
   * from the user's last prompt, so its end is no new "finished". Kept in step with the messages
   * by `withTurnClock`; absent until a report started a turn.
   */
  isAgentReply?: boolean
}

export interface PermissionAsk {
  requestId: string
  toolName: string
  input: Record<string, unknown>
  /** Rules Claude offers to remember with an allow ("always for git push"), maybe none. */
  suggestions: PermissionUpdate[]
}

export interface ChatTabState {
  id: string
  title: string
  /** `CLAUDE_CONFIG_DIR` of the account, `null` for the default profile */
  profile: string | null
  account: string
  cwd: string
  /** SSH host alias the session runs on; `null` is this computer */
  machine: string | null
  sessionId: string | null
  /** Model alias (`opus`, `sonnet`, `haiku`); `null` keeps the profile's default */
  model: string | null
  /** Claude Code permission mode; `null` keeps the profile's default */
  permissionMode: PermissionMode | null
  /** Effort level (`low` … `max`); `null` keeps the profile's default */
  effort: string | null
  status: TabStatus
  /**
   * While the chat moves to another account, the status it had before; lists show that one, so
   * the row stays where it was while Claude stops and starts again. `null` otherwise.
   */
  statusBeforeMove: TabStatus | null
  messages: ChatMessage[]
  /** Text Claude is writing right now, before its message is complete */
  streaming: string
  /** Reasoning Claude is streaming right now; `null` while it is not thinking */
  thinking: string | null
  /** The turn Claude is working on; `null` while idle */
  turn: RunningTurn | null
  /** When the last turn ended here (ms); `null` until one did in this run of the app */
  finishedAt: number | null
  /**
   * When the last turn ended while nobody looked at this chat; `null` once it was seen or a new
   * turn started. Gives the tab its place in the finish order.
   */
  unseenAt: number | null
  /**
   * Prompts sent but not yet echoed by Claude, shown after `messages` meanwhile. Claude echoes a
   * prompt only once it takes it up, often seconds later or just before its answer.
   */
  pending: ChatMessage[]
  /**
   * No prompt of this session came back from Claude yet. Claude writes the transcript with the
   * first one, so until then a missing transcript is an empty chat, not a lost one.
   */
  isFresh: boolean
  /** The user muted this chat: it never notifies */
  isMuted: boolean
  history: HistoryState
  permission: PermissionAsk | null
  /** Last error or limit message, shown above the composer */
  notice: string | null
  hasMore: boolean
  /** MCP servers of the session, from Claude's `system/init`; `null` until it reported them once */
  connectors: Connector[] | null
  /** Context window Claude reported with the last result; `null` until a turn ended */
  contextWindow: number | null
  /** Background agents that finished while the app listened */
  agentNotices: AgentNotice[]
  /** The tool calls of each subagent as they arrived, by its Agent call id; live only */
  liveSubagents: LiveSubagents
  /** Background tasks the stream last listed as running; live only, `null` until the first list */
  backgroundTasks: BackgroundTasks | null
  /** agentd's limit card for this chat; agentd sends it again on attach, so it is not saved */
  limit: LimitState
  /** The account (profile folder) to move to once the running turn ends, as suggested at 90 % */
  moveAfterTurn: string | null
  /** Claude Code waits to ask Anthropic again after an API error; `null` once it goes on */
  retry: ApiRetry | null
  /** The API call Claude is streaming and how many characters of it came so far; live only */
  streamUsage: StreamUsage
  /**
   * Final output tokens per API message id, from the end of each streamed call. The messages
   * themselves carry the count from the call's start until the transcript is read again.
   */
  outputs: Readonly<Record<string, number>>
}

export interface StreamUsage {
  messageId: string | null
  chars: number
}

const NO_STREAM: StreamUsage = { messageId: null, chars: 0 }

export const modelList = ['opus', 'sonnet', 'haiku'] as const
/** The modes Bull offers, in the order Shift+Tab walks them in Claude Code's terminal. */
export const permissionModeList = ['default', 'acceptEdits', 'plan', 'auto'] as const
export type OfferedMode = (typeof permissionModeList)[number]
/** Modes an account can set that Claude then reports; Bull shows them but never offers them. */
export const otherPermissionModeList = ['bypassPermissions', 'dontAsk'] as const
export type PermissionMode = OfferedMode | (typeof otherPermissionModeList)[number]

/** What reopens a tab after a restart; everything else comes back from the transcript. */
export type SavedTab = SavedTabFields &
  // Optional: tabs saved before muting or effort existed have neither.
  Partial<Pick<ChatTabState, 'isMuted' | 'effort'>>

type SavedTabFields = Pick<
  ChatTabState,
  | 'id'
  | 'title'
  | 'profile'
  | 'account'
  | 'cwd'
  | 'machine'
  | 'sessionId'
  | 'model'
  | 'permissionMode'
  | 'isFresh'
> &
  // Optional: a new tab has finished nothing, and tabs saved before the finish order lack it.
  Partial<Pick<ChatTabState, 'unseenAt'>>

export const savedTabOf = ({
  id,
  title,
  isMuted,
  profile,
  account,
  cwd,
  machine,
  sessionId,
  model,
  permissionMode,
  effort,
  isFresh,
  unseenAt
}: ChatTabState): SavedTab => ({
  id,
  title,
  isMuted,
  profile,
  account,
  cwd,
  machine,
  sessionId,
  model,
  permissionMode,
  effort,
  isFresh,
  unseenAt
})

export const newTab = (fields: SavedTab): ChatTabState => ({
  ...fields,
  isMuted: fields.isMuted ?? false,
  // Tabs saved before machine, model and mode existed have none of these fields.
  machine: fields.machine ?? null,
  model: fields.model ?? null,
  permissionMode: fields.permissionMode ?? null,
  effort: fields.effort ?? null,
  // Saved before the flag existed: only a tab whose prompt came back has a title.
  isFresh: fields.isFresh ?? !fields.title,
  unseenAt: fields.unseenAt ?? null,
  status: fields.sessionId ? 'ended' : 'starting',
  statusBeforeMove: null,
  messages: [],
  streaming: '',
  thinking: null,
  turn: null,
  finishedAt: null,
  pending: [],
  history: fields.sessionId ? 'none' : 'loaded',
  permission: null,
  notice: null,
  hasMore: false,
  connectors: null,
  contextWindow: null,
  agentNotices: [],
  liveSubagents: {},
  backgroundTasks: null,
  limit: { kind: 'none' },
  moveAfterTurn: null,
  retry: null,
  streamUsage: NO_STREAM,
  outputs: {}
})

const firstText = (message: ChatMessage): string | undefined =>
  message.blocks.find((block) => block.type === 'text')?.text

/** The messages of the running turn, after the one that was last when it started. */
export const turnMessagesOf = (tab: Pick<ChatTabState, 'messages' | 'turn'>): ChatMessage[] => {
  if (!tab.turn) return []
  const start = tab.messages.findIndex((message) => message.uuid === tab.turn?.afterUuid)
  return tab.messages.slice(start + 1)
}

/** Claude has written, thought or called a tool in the running turn. */
export const hasRepliedThisTurn = (tab: ChatTabState): boolean =>
  turnMessagesOf(tab).some((known) => known.role === 'assistant')

const withMessage = (tab: ChatTabState, received: ChatMessage): ChatTabState => {
  if (tab.messages.some((known) => known.uuid === received.uuid))
    // On reattach the transcript can hold a block before its live message arrives; the block is
    // finished all the same, so its replayed live text must not stay as a second copy.
    return received.role === 'assistant' ? { ...tab, streaming: '', thinking: null } : tab
  const isPrompt = isPromptEcho(received)
  const isFromAgent = isAgentMessage(received)
  // A prompt that arrives after Claude already answered in this turn was typed while it worked;
  // an agent's message then joins the turn the same way.
  const joined =
    (isPrompt || isFromAgent) && hasRepliedThisTurn(tab)
      ? { ...received, is_mid_turn: true }
      : received
  // The Agent call that names the subagent came before its report.
  const message = isFromAgent
    ? (withAgentTitles([...tab.messages, joined]).at(-1) ?? joined)
    : joined
  const prompt = isPrompt ? firstText(message) : undefined
  return {
    ...tab,
    messages: [...tab.messages, message],
    pending: withoutEchoed(tab.pending, message),
    isFresh: tab.isFresh && !isPrompt,
    streaming: message.role === 'assistant' ? '' : tab.streaming,
    thinking: message.role === 'assistant' ? null : tab.thinking,
    title: tab.title || (prompt ?? '').slice(0, TITLE_CHARS)
  }
}

/** The characters a streamed delta adds: text, reasoning or a tool call's input. */
const deltaCharsOf = (delta: Record<string, unknown> | undefined): number => {
  const piece = delta?.text ?? delta?.thinking ?? delta?.partial_json
  return typeof piece === 'string' ? piece.length : 0
}

/** The end of a streamed call: its final output count goes to `outputs`. */
const withCallEnd = (tab: ChatTabState, inner: ClaudeEvent): ChatTabState => {
  const usage = inner.usage as { output_tokens?: unknown } | undefined
  const { messageId } = tab.streamUsage
  if (!messageId || typeof usage?.output_tokens !== 'number') return tab
  return {
    ...tab,
    outputs: { ...tab.outputs, [messageId]: usage.output_tokens },
    streamUsage: { messageId, chars: 0 }
  }
}

const withStream = (tab: ChatTabState, inner: ClaudeEvent): ChatTabState => {
  const streamed = withStreamText(tab, inner)
  if (inner.type === 'message_delta') return withCallEnd(streamed, inner)
  if (inner.type === 'message_start') {
    const message = inner.message as { id?: unknown } | undefined
    const messageId = typeof message?.id === 'string' ? message.id : null
    // Claude answers again: a retry it announced is over.
    return { ...streamed, retry: null, streamUsage: { messageId, chars: 0 } }
  }
  if (inner.type !== 'content_block_delta') return streamed
  const chars = deltaCharsOf(inner.delta as Record<string, unknown> | undefined)
  if (!chars) return streamed
  const { messageId, chars: before } = streamed.streamUsage
  return { ...streamed, streamUsage: { messageId, chars: before + chars } }
}

const withStreamText = (tab: ChatTabState, inner: ClaudeEvent): ChatTabState => {
  switch (inner.type) {
    case 'message_start':
      return { ...tab, streaming: '', thinking: null, status: 'working' }
    case 'content_block_start': {
      const block = inner.content_block as { type?: string } | undefined
      return block?.type === 'thinking' ? { ...tab, thinking: '', status: 'working' } : tab
    }
    case 'content_block_delta': {
      const delta = inner.delta as { type?: string; text?: string; thinking?: string } | undefined
      if (delta?.type === 'thinking_delta')
        return {
          ...tab,
          thinking: (tab.thinking ?? '') + (delta.thinking ?? ''),
          status: 'working'
        }
      if (delta?.type !== 'text_delta') return tab
      return { ...tab, streaming: tab.streaming + (delta.text ?? ''), status: 'working' }
    }
    default:
      return tab
  }
}

const sessionIdOfInit = (event: ClaudeEvent): string | null =>
  event.subtype === 'init' && !event.parent_tool_use_id && typeof event.session_id === 'string'
    ? event.session_id
    : null

/** The chat of a tab as it is right after `/clear`: nothing said yet, same folder and account. */
const withEmptyChat = (tab: ChatTabState): ChatTabState => ({
  ...tab,
  title: '',
  messages: [],
  streaming: '',
  thinking: null,
  permission: null,
  notice: null,
  hasMore: false,
  history: 'loaded',
  finishedAt: null,
  unseenAt: null,
  contextWindow: null,
  agentNotices: [],
  liveSubagents: {},
  backgroundTasks: null,
  limit: { kind: 'none' },
  moveAfterTurn: null,
  retry: null,
  streamUsage: NO_STREAM,
  outputs: {}
})

/**
 * Clears a tab whose Claude is not running: a new session under a new id in the same tab, as
 * `/clear` would start. The old transcript stays on disk.
 */
export const withNewSession = (tab: ChatTabState, sessionId: string): ChatTabState => ({
  ...withEmptyChat(tab),
  sessionId,
  isFresh: true
})

const withClaude = (tab: ChatTabState, event: ClaudeEvent): ChatTabState => {
  switch (event.type) {
    case 'system': {
      const connectors = connectorsOf(event)
      const withConnectors = withReportedSettings(connectors ? { ...tab, connectors } : tab, event)
      // After `/clear` Claude goes on under a new session id; resuming must find that one.
      const sessionId = sessionIdOfInit(event)
      return sessionId && sessionId !== tab.sessionId
        ? { ...withConnectors, sessionId }
        : withConnectors
    }
    case 'conversation_reset':
      // Claude wrote `/clear` into the new transcript already; a reload finds it there.
      return { ...withEmptyChat(tab), isFresh: false }
    case 'stream_event':
      // A subagent streams too; its text belongs inside its Agent call, not in the reply.
      return event.parent_tool_use_id ? tab : withStream(tab, event.event as ClaudeEvent)
    case 'control_request': {
      const request = event.request as {
        subtype?: string
        tool_name?: string
        input?: Record<string, unknown>
        permission_suggestions?: unknown
      }
      if (request.subtype !== 'can_use_tool') return tab
      const permission = {
        requestId: String(event.request_id),
        toolName: request.tool_name ?? '',
        input: request.input ?? {},
        suggestions: suggestionsOf(request.permission_suggestions)
      }
      return { ...tab, permission, status: 'asking' }
    }
    case 'result': {
      // An interrupted turn is an error result without text; only real messages become notices.
      const text = typeof event.result === 'string' ? event.result : ''
      return {
        ...tab,
        status: 'idle',
        streaming: '',
        thinking: null,
        notice: event.is_error && text ? text : null,
        retry: null,
        contextWindow: contextWindowOf(event) ?? tab.contextWindow
      }
    }
    default:
      return tab
  }
}

/**
 * A message without a timestamp gets the time it arrived here, so live thinking shows a
 * duration like the transcript does after a reload.
 */
export const stampArrival = (event: AgentdEvent, now: number): AgentdEvent =>
  event.type === 'message' && !event.message.at
    ? { ...event, message: { ...event.message, at: new Date(now).toISOString() } }
    : event

/**
 * The account a start reports, when a limit moved the chat while the app was away. Only on a real
 * change: the default profile is `null` here but a folder in agentd's report.
 */
const movedAccountOf = (
  tab: ChatTabState,
  event: Extract<AgentdEvent, { type: 'started' }>
): Pick<ChatTabState, 'profile' | 'account'> =>
  event.profile && event.account && event.account !== tab.account
    ? { profile: event.profile, account: event.account }
    : { profile: tab.profile, account: tab.account }

/** The tab as lists show it: during a move to another account, with its status from before. */
export const listedTabOf = (tab: ChatTabState): ChatTabState =>
  tab.statusBeforeMove ? { ...tab, status: tab.statusBeforeMove } : tab

/** The tab after one agentd event that belongs to it. */
export const applyEvent = (tab: ChatTabState, event: AgentdEvent): ChatTabState => {
  switch (event.type) {
    case 'started':
      return {
        ...tab,
        ...movedAccountOf(tab, event),
        sessionId: event.session_id,
        status: event.working ? 'working' : 'idle',
        statusBeforeMove: null,
        notice: null
      }
    case 'message':
      return withMessage(tab, event.message)
    case 'claude':
      return withClaude(tab, event.event)
    case 'streaming':
      // agentd's own copy of the stream so far: it replaces the live text rather than adding to it,
      // so a replay to an app that already shows it changes nothing.
      return {
        ...tab,
        streaming: event.text,
        thinking: event.thinking,
        streamUsage: { messageId: event.message_id, chars: event.chars }
      }
    case 'exited':
      return {
        ...tab,
        status: 'ended',
        // The stop before a move ends the old Claude; the new one exiting before it started ends it.
        statusBeforeMove: tab.status === 'starting' ? null : tab.statusBeforeMove,
        streaming: '',
        thinking: null,
        permission: null,
        retry: null
      }
    case 'error':
      // While starting, the error is the start's: Claude never ran, the next prompt starts again.
      return {
        ...tab,
        notice: event.message,
        status: tab.status === 'starting' ? 'ended' : tab.status,
        statusBeforeMove: tab.status === 'starting' ? null : tab.statusBeforeMove
      }
    default:
      return tab
  }
}

/**
 * Notes background agents that finished. Kept for this run only (`savedTabOf` leaves them out)
 * and capped: the panel needs the newest few, a long session would otherwise collect hundreds.
 */
export const withAgentNotices = (tab: ChatTabState, notices: AgentNotice[]): ChatTabState =>
  notices.length
    ? { ...tab, agentNotices: [...tab.agentNotices, ...notices].slice(-MAX_AGENT_NOTICES) }
    : tab

/** The background tasks the stream just listed as running. */
export const withBackgroundTasks = (
  tab: ChatTabState,
  ids: string[],
  now: number
): ChatTabState => ({
  ...tab,
  backgroundTasks: { ids, at: now }
})

/** A sent prompt shows at once; `withMessage` swaps in Claude's echo. */
export const withPendingPrompt = (tab: ChatTabState, prompt: ChatMessage): ChatTabState => ({
  ...tab,
  pending: [...tab.pending, prompt]
})

/** Takes back prompts that will not reach Claude, all of them without `uuids`. */
export const withoutPending = (tab: ChatTabState, uuids?: ReadonlySet<string>): ChatTabState => ({
  ...tab,
  pending: uuids ? tab.pending.filter((prompt) => !uuids.has(prompt.uuid)) : []
})

/** Older messages from the transcript go in front of what is already shown. */
export const withHistory = (
  tab: ChatTabState,
  older: ChatMessage[],
  hasMore: boolean
): ChatTabState => {
  const known = new Set(tab.messages.map((message) => message.uuid))
  return {
    ...tab,
    messages: withAgentTitles([...older.filter((m) => !known.has(m.uuid)), ...tab.messages]),
    hasMore
  }
}

/**
 * Starts the elapsed-time clock when a turn begins; once Claude is done it clears the clock and,
 * if Claude answered, notes when the turn ended.
 */
export const withTurnClock = (tab: ChatTabState, now: number): ChatTabState => {
  const isBusy = tab.status === 'working' || tab.status === 'asking'
  if (!isBusy && !tab.turn) return tab
  if (isBusy && tab.turn) return withAgentReplyNoted(tab, tab.turn)
  if (isBusy) {
    const turn = { startedAt: now, afterUuid: tab.messages.at(-1)?.uuid ?? null }
    // Claude took up a subagent's report on its own: the last answer is still news.
    if (isAgentReplyOf(tab, turn)) return { ...tab, turn: { ...turn, isAgentReply: true } }
    // A new turn makes the last answer old news: the tab leaves the finish order.
    return { ...tab, turn, unseenAt: null }
  }
  // Only an answer to the user counts as finished; a crash, an exit, an error result mid-turn or
  // the reply to an agent's message does not.
  const isAnswered =
    tab.status === 'idle' && !tab.notice && !(tab.turn && isAgentReplyOf(tab, tab.turn))
  return { ...tab, turn: null, finishedAt: isAnswered ? now : tab.finishedAt }
}

/**
 * The turn answers a subagent's report: one stood right before it or opened it (its echo can
 * come after Claude started), and the user has sent nothing for it.
 */
const isAgentReplyOf = (tab: ChatTabState, turn: RunningTurn): boolean => {
  if (tab.pending.length) return false
  const messages = turnMessagesOf({ messages: tab.messages, turn })
  if (messages.some(isPromptEcho)) return false
  const before = tab.messages.find((message) => message.uuid === turn.afterUuid)
  return isAgentMessage(before) || isAgentMessage(messages[0])
}

/** A prompt sent into a report's turn makes it the user's: from then on it is a new turn. */
const withAgentReplyNoted = (tab: ChatTabState, turn: RunningTurn): ChatTabState => {
  const isAgentReply = isAgentReplyOf(tab, turn)
  if (isAgentReply === !!turn.isAgentReply) return tab
  return isAgentReply
    ? { ...tab, turn: { ...turn, isAgentReply } }
    : { ...tab, turn: { ...turn, isAgentReply }, unseenAt: null }
}
