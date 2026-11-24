import type { Block, ChatMessage } from '@/types/agentd.type'
import type { ChatTabState } from '@/utils/chatTab'

type TextBlock = Extract<Block, { type: 'text' }>
const isText = (block: Block): block is TextBlock => block.type === 'text'

/** When a tab's last turn ended, as the finish tracking compares it between two updates. */
export interface FinishTime {
  id: string
  finishedAt: number | null
}

const MARKDOWN_LEAD = /^(?:#{1,6}\s+|[-*+]\s+|>\s*|\d+\.\s+)/
const MARKDOWN_MARKS = /\*\*|__|`/g

type RankedTab = Pick<ChatTabState, 'id' | 'unseenAt' | 'notice'>

/**
 * A chat that reported an error after it finished shows that instead of its number: the error
 * matters more than the order (18.11.2026). It stays unseen, the others move up. A plain
 * `ended` is no error: every tab restored after a restart is `ended` until its next prompt.
 */
const hasFailedSince = (tab: RankedTab): boolean => tab.notice !== null

/**
 * Finished tabs nobody looked at yet, the most recently finished first: their place in the
 * finish order, ① being the newest.
 */
export const finishOrderOf = (tabs: RankedTab[]): string[] =>
  tabs
    .flatMap((tab) =>
      tab.unseenAt === null || hasFailedSince(tab) ? [] : [{ id: tab.id, at: tab.unseenAt }]
    )
    .sort((a, b) => b.at - a.at)
    .map((entry) => entry.id)

/** Tab id → its number in the finish order, starting at 1. */
export const finishRanksOf = (tabs: RankedTab[]): Map<string, number> =>
  new Map(finishOrderOf(tabs).map((id, index) => [id, index + 1]))

/**
 * The tabs with the finish order up front, ① leftmost, so the header reads like the numbers. The
 * others follow in the order they had, which keeps where the user dragged them. The same array
 * when nothing moves.
 */
export const finishSortedOf = <T extends RankedTab>(tabs: T[]): T[] => {
  const order = finishOrderOf(tabs)
  const ranked = new Set(order)
  const byId = new Map(tabs.map((tab) => [tab.id, tab]))
  const sorted = [
    ...order.flatMap((id) => byId.get(id) ?? []),
    ...tabs.filter((tab) => !ranked.has(tab.id))
  ]
  return sorted.every((tab, index) => tab === tabs[index]) ? tabs : sorted
}

/** True when both maps give the same tabs the same numbers. */
export const isSameRanks = (a: Map<string, number>, b: Map<string, number>): boolean =>
  a.size === b.size && [...a].every(([id, rank]) => b.get(id) === rank)

export const finishTimesOf = (tabs: ChatTabState[]): FinishTime[] =>
  tabs.map(({ id, finishedAt }) => ({ id, finishedAt }))

/** True when no tab's finish time changed; streamed text alone changes none of these. */
export const isSameFinishTimes = (a: FinishTime[], b: FinishTime[]): boolean =>
  a.length === b.length &&
  a.every((entry, at) => entry.id === b[at].id && entry.finishedAt === b[at].finishedAt)

/** Tabs whose turn ended since `before`; a tab that just opened has not finished anything. */
export const newlyFinishedOf = (
  before: FinishTime[],
  after: FinishTime[]
): { id: string; at: number }[] => {
  const previous = new Map(before.map((entry) => [entry.id, entry.finishedAt]))
  return after.flatMap(({ id, finishedAt }) =>
    finishedAt !== null && previous.has(id) && previous.get(id) !== finishedAt
      ? [{ id, at: finishedAt }]
      : []
  )
}

/** The user sees a chat only while it is on screen in a focused window. */
export const isLookingAt = (id: string, shownId: string | null, isFocused: boolean): boolean =>
  isFocused && shownId === id

/**
 * Marks the turn that ended at `at` as not seen yet. Ignored when the tab went on meanwhile: a
 * new turn started, or the chat was cleared.
 */
export const withUnseen = (tab: ChatTabState, at: number): ChatTabState =>
  tab.turn === null && tab.finishedAt === at ? { ...tab, unseenAt: at } : tab

export const withSeen = (tab: ChatTabState): ChatTabState =>
  tab.unseenAt === null ? tab : { ...tab, unseenAt: null }

/** The first line of Claude's last answer, without markdown marks; `''` when none is loaded. */
export const summaryOf = (messages: ChatMessage[]): string => {
  const answer = messages.findLast(
    (message) => message.role === 'assistant' && message.blocks.some(isText)
  )
  const text = answer?.blocks.findLast(isText)?.text ?? ''
  const line = text
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean)
  return (line ?? '').replace(MARKDOWN_LEAD, '').replace(MARKDOWN_MARKS, '')
}
