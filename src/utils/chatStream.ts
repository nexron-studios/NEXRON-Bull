import type { Block, ChatMessage } from '@/types/agentd.type'
import { MS_PER_SECOND } from '@/utils/elapsed'
import { sourcesOfCall, uniqueSources, type Source } from '@/utils/sources'
import { isPromptEcho } from '@/utils/pendingPrompts'
import { taskCallsOf, todosOf, type TaskCall, type Todo } from '@/utils/todos'
import { isReadOnlyTool, isTaskTool } from '@/utils/toolKind'
import { hookBlockOf } from '@/utils/toolOutput'
import { visibleMessages, type ToolResultBlock, type ToolUseBlock } from '@/utils/toolPairs'
import { turnStatsOf, type TurnStats } from '@/utils/turnStats'

export interface Reasoning {
  text: string
  /** How long Claude thought, from the message timestamps; `null` when they are missing */
  seconds: number | null
}

/** One entry inside a folded run of reads and searches. */
export type ReadStep =
  | { kind: 'tool'; key: string; block: ToolUseBlock }
  | { kind: 'reasoning'; key: string; reasoning: Reasoning }

/**
 * What the chat pane renders, in order. `isCurrent`: nothing follows it yet, so it belongs to the
 * turn that may still run. `stats` sits on the last answer of a finished turn.
 */
export type StreamItem =
  | { kind: 'message'; key: string; message: ChatMessage; stats?: TurnStats }
  | { kind: 'reasoning'; key: string; reasoning: Reasoning }
  /** A call that changes something or runs outside: its own card */
  | { kind: 'tool'; key: string; block: ToolUseBlock; isCurrent: boolean }
  /** Consecutive reads and searches as one quiet line, like "3 Dateien gelesen, 1 Suche" */
  | { kind: 'reads'; key: string; steps: ReadStep[]; isCurrent: boolean }
  | { kind: 'todos'; key: string; todos: Todo[]; isCurrent: boolean }
  | { kind: 'sources'; key: string; sources: Source[] }

export interface StreamOptions {
  /** Final output tokens per API message, known live before the messages carry them */
  outputs?: Readonly<Record<string, number>>
  /** The last turn still runs: it gets no stats yet */
  isRunning?: boolean
}

/**
 * One piece of a run of Claude's work: a block of its messages, or a message that joins the run
 * without ending it (a prompt sent meanwhile, a hook that spoke up).
 */
type Entry =
  | { kind: 'block'; message: ChatMessage; index: number; block: Block }
  | { kind: 'inline'; message: ChatMessage }

type BlockEntry = Extract<Entry, { kind: 'block' }>

interface StreamContext {
  seconds: Map<string, number | null>
  results: Map<string, ToolResultBlock>
  earlierTaskCalls: TaskCall[]
}

const secondsBetween = (from: string | null, to: string | null): number | null => {
  if (!from || !to) return null
  const ms = Date.parse(to) - Date.parse(from)
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.max(1, Math.round(ms / MS_PER_SECOND))
}

/**
 * Thinking time per message: Claude Code writes each block as its own line once it is done,
 * so a thinking block took from the line before it (prompt or tool result) until its own.
 */
export const thinkingSeconds = (messages: ChatMessage[]): Map<string, number | null> =>
  new Map(
    messages.flatMap((message, index) =>
      message.blocks.some((block) => block.type === 'thinking')
        ? [[message.uuid, secondsBetween(messages[index - 1]?.at ?? null, message.at)] as const]
        : []
    )
  )

const keyOf = (entry: Entry): string =>
  entry.kind === 'block' ? `${entry.message.uuid}:${entry.index}` : entry.message.uuid

const reasoningOf = (entry: BlockEntry, seconds: Map<string, number | null>): Reasoning => ({
  text: entry.block.type === 'thinking' ? entry.block.text : '',
  seconds: seconds.get(entry.message.uuid) ?? null
})

/** Claude's text: consecutive text blocks as one message, so copying takes all of it. */
const answerOf = (texts: BlockEntry[]): StreamItem[] => {
  const [first] = texts
  if (!first) return []
  const message = { ...first.message, blocks: texts.map((entry) => entry.block) }
  return [{ kind: 'message', key: `answer:${keyOf(first)}`, message }]
}

/**
 * The run in reading order. Reads and searches in a row fold into one line; thinking between
 * them folds in too, thinking after the last one stays outside. Text, a prompt or a call that
 * changes something ends the fold.
 */
const flatItemsOf = (entries: Entry[], isCurrent: boolean, context: StreamContext) => {
  const { seconds, results } = context
  // A read a hook stopped stays out of the fold, so its hook line is seen.
  const isFolded = (block: ToolUseBlock) =>
    isReadOnlyTool(block.name) && !hookBlockOf(results.get(block.id) ?? null)
  const items: StreamItem[] = []
  let texts: BlockEntry[] = []
  let reads: ReadStep[] = []
  let thoughts: BlockEntry[] = []
  const reasoningItem = (entry: BlockEntry): Extract<ReadStep, { kind: 'reasoning' }> => ({
    kind: 'reasoning',
    key: keyOf(entry),
    reasoning: reasoningOf(entry, seconds)
  })
  const flushTexts = () => {
    items.push(...answerOf(texts))
    texts = []
  }
  const flushReads = () => {
    const [first] = reads
    if (first) items.push({ kind: 'reads', key: `reads:${first.key}`, steps: reads, isCurrent })
    items.push(...thoughts.map(reasoningItem))
    reads = []
    thoughts = []
  }
  for (const entry of entries) {
    if (entry.kind === 'inline') {
      flushTexts()
      flushReads()
      items.push({ kind: 'message', key: keyOf(entry), message: entry.message })
      continue
    }
    const { block } = entry
    if (block.type === 'text') {
      flushReads()
      texts.push(entry)
      continue
    }
    if (block.type === 'thinking') {
      flushTexts()
      if (reads.length) thoughts.push(entry)
      else items.push(reasoningItem(entry))
      continue
    }
    if (block.type !== 'tool_use' || isTaskTool(block.name)) continue
    flushTexts()
    if (isFolded(block)) {
      reads.push(...thoughts.map(reasoningItem))
      reads.push({ kind: 'tool', key: keyOf(entry), block })
      thoughts = []
      continue
    }
    flushReads()
    items.push({ kind: 'tool', key: keyOf(entry), block, isCurrent })
  }
  flushTexts()
  flushReads()
  return items
}

const toolCallsOf = (entries: Entry[]): ToolUseBlock[] =>
  entries.flatMap((entry) =>
    entry.kind === 'block' && entry.block.type === 'tool_use' ? [entry.block] : []
  )

/** The plan as it stands after this run, shown only below a run that changed it. */
const todosItem = (
  segmentKey: string,
  earlier: TaskCall[],
  calls: TaskCall[],
  isCurrent: boolean
): StreamItem[] => {
  if (!calls.length) return []
  const todos = todosOf([...earlier, ...calls])
  return todos.length ? [{ kind: 'todos', key: `todos:${segmentKey}`, todos, isCurrent }] : []
}

const sourcesItem = (
  segmentKey: string,
  entries: Entry[],
  results: Map<string, ToolResultBlock>
): StreamItem[] => {
  const sources = uniqueSources(
    toolCallsOf(entries).flatMap((call) =>
      sourcesOfCall(call.name, call.input, results.get(call.id) ?? null)
    )
  )
  return sources.length ? [{ kind: 'sources', key: `sources:${segmentKey}`, sources }] : []
}

/** One uninterrupted run of Claude's work, then the pages it read and its plan. */
const segmentItems = (
  segmentKey: string,
  entries: Entry[],
  isCurrent: boolean,
  context: StreamContext
): StreamItem[] => [
  ...flatItemsOf(entries, isCurrent, context),
  ...sourcesItem(segmentKey, entries, context.results),
  ...todosItem(
    segmentKey,
    context.earlierTaskCalls,
    taskCallsOf(toolCallsOf(entries), context.results),
    isCurrent
  )
]

/** A message that joins the run it arrives in instead of ending it. */
const joinsRun = (message: ChatMessage): boolean =>
  !!message.is_mid_turn || message.blocks.every((block) => block.type === 'hook')

/** A prompt the user sent that starts a turn of its own. */
const opensTurn = (message: ChatMessage): boolean => message.role === 'user' && !message.is_mid_turn

/**
 * Where the first turn of the stream starts, -1 without one. Older messages loaded above can only
 * join, regroup and rekey what comes before it; from here on every item keeps its key. A prompt,
 * not any user line: a page can start with a tool result whose call is still on the next page.
 */
export const firstTurnIndexOf = (items: StreamItem[]): number =>
  items.findIndex(
    (item) =>
      item.kind === 'message' &&
      item.key === item.message.uuid &&
      isPromptEcho(item.message) &&
      !item.message.is_mid_turn
  )

/** Puts a turn's stats on its last answer. */
const withStats = (items: StreamItem[], from: number, stats: TurnStats | null): void => {
  if (!stats) return
  const last = items.findLastIndex(
    (item, index) => index >= from && item.kind === 'message' && item.message.role === 'assistant'
  )
  const answer = items[last]
  if (answer?.kind === 'message') items[last] = { ...answer, stats }
}

/**
 * The chat as the pane shows it: prompts, reasoning, tool cards, folded reads, answers, steps.
 * Prompts marked `is_mid_turn` were sent while Claude was working; they stay inside the run they
 * interrupted instead of starting a new one, and so do hook lines.
 */
export const buildStream = (
  messages: ChatMessage[],
  results: Map<string, ToolResultBlock>,
  { outputs = {}, isRunning = false }: StreamOptions = {}
): StreamItem[] => {
  const seconds = thinkingSeconds(messages)
  const items: StreamItem[] = []
  // Claude Code's task list belongs to the session, so each run continues the one before.
  let earlierTaskCalls: TaskCall[] = []
  let segment: Entry[] = []
  let turn: ChatMessage[] = []
  let turnStart = 0
  const flush = (isCurrent: boolean) => {
    const [first] = segment
    if (!first) return
    const context = { seconds, results, earlierTaskCalls }
    items.push(...segmentItems(keyOf(first), segment, isCurrent, context))
    earlierTaskCalls = [...earlierTaskCalls, ...taskCallsOf(toolCallsOf(segment), results)]
    segment = []
  }
  const closeTurn = () => withStats(items, turnStart, turnStatsOf(turn, outputs))
  for (const message of visibleMessages(messages)) {
    if (message.role === 'assistant') {
      turn.push(message)
      segment.push(
        ...message.blocks.map((block, index) => ({ kind: 'block' as const, message, index, block }))
      )
      continue
    }
    if (segment.length && joinsRun(message)) {
      segment.push({ kind: 'inline', message })
      continue
    }
    flush(false)
    if (opensTurn(message)) {
      closeTurn()
      turn = [message]
      turnStart = items.length
    }
    items.push({ kind: 'message', key: message.uuid, message })
  }
  flush(true)
  if (!isRunning) closeTurn()
  return items
}
