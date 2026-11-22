import type { Machine } from '@/api/services/agentd.service'
import type { ModelFamily, SessionSummaryProps } from '@/types/agentd.type'
import { isBusyStatus, type ChatTabState } from '@/utils/chatTab'
import { startOfDay } from '@/utils/sessionList'

/** How far back the overview's "done" list reaches; `week` is today and the six days before. */
export const doneRangeList = ['today', 'week', 'all'] as const
export type DoneRange = (typeof doneRangeList)[number]
export const DEFAULT_DONE_RANGE: DoneRange = 'today'

const DAYS_BEFORE_TODAY_IN_WEEK = 6

/** Where "continue" leads: the open tab, or a new tab that resumes the transcript. */
export type DoneSource =
  { kind: 'tab'; tabId: string } | { kind: 'session'; session: SessionSummaryProps }

/** A finished session of one machine, as the overview lists it. */
export interface DoneSession {
  /** Machine plus tab id, or machine, session id and account */
  key: string
  machine: Machine
  title: string
  cwd: string
  account: string
  /** When its last turn ended (tab) or its transcript last changed (session), in ms */
  finishedAt: number
  source: DoneSource
}

/** A row of the overview's "done" list: unseen chats carry their finish number, ① the newest. */
export interface RankedDone extends DoneSession {
  rank: number | null
}

/** Narrowest a running card may get before the grid drops a column, in px. */
const MIN_CARD_WIDTH_PX = 272
/** The running grid's `gap-4` in `OverviewView`; one gap at every width keeps this exact. */
const GRID_GAP_PX = 16
const MAX_GRID_COLUMNS = 3

/** `?done=` from the URL; anything else is the default. */
export const parseDoneRange = (value: unknown): DoneRange =>
  doneRangeList.find((range) => range === value) ?? DEFAULT_DONE_RANGE

const conversationOf = (machine: Machine, sessionId: string) => `${machine ?? ''}:${sessionId}`

const doneOfTab = (tab: ChatTabState, finishedAt: number): DoneSession => ({
  key: `${tab.machine ?? ''}:${tab.id}`,
  machine: tab.machine,
  title: tab.title,
  cwd: tab.cwd,
  account: tab.account,
  finishedAt,
  source: { kind: 'tab', tabId: tab.id }
})

const doneOfSession = (machine: Machine, session: SessionSummaryProps): DoneSession => ({
  key: `${conversationOf(machine, session.session_id)}:${session.account}`,
  machine,
  title: session.title,
  cwd: session.cwd,
  account: session.account,
  finishedAt: session.modified_ms,
  source: { kind: 'session', session }
})

/**
 * Every machine's finished sessions as one list, newest first: open tabs that ended a turn, and
 * the recent transcripts. agentd leaves sessions with a live Claude out of `recent`, so an open
 * tab only shows up as a tab. A session a tab still works on is not done; the same id on another
 * account is the same conversation moved over, so only its newest copy counts.
 */
export const doneSessionsOf = (
  perMachine: { machine: Machine; sessions: SessionSummaryProps[] }[],
  tabs: ChatTabState[]
): DoneSession[] => {
  // A moved session has a copy per account; the newest one dates the conversation.
  const modified = new Map<string, number>()
  for (const { machine, sessions } of perMachine)
    for (const session of sessions) {
      const conversation = conversationOf(machine, session.session_id)
      modified.set(conversation, Math.max(modified.get(conversation) ?? 0, session.modified_ms))
    }
  const fromTabs = tabs.flatMap((tab) => {
    if (isBusyStatus(tab.status)) return []
    const known = tab.sessionId ? modified.get(conversationOf(tab.machine, tab.sessionId)) : null
    const finishedAt = tab.finishedAt ?? known ?? null
    return finishedAt === null ? [] : [doneOfTab(tab, finishedAt)]
  })
  const withTab = new Set(
    tabs.flatMap((tab) => (tab.sessionId ? [conversationOf(tab.machine, tab.sessionId)] : []))
  )
  const newest = new Map<string, DoneSession>()
  for (const { machine, sessions } of perMachine) {
    for (const session of sessions) {
      const conversation = conversationOf(machine, session.session_id)
      if (withTab.has(conversation)) continue
      const known = newest.get(conversation)
      if (known && known.finishedAt >= session.modified_ms) continue
      newest.set(conversation, doneOfSession(machine, session))
    }
  }
  return [...fromTabs, ...newest.values()].sort((a, b) => b.finishedAt - a.finishedAt)
}

/** The first moment that still belongs to the range, in ms; `all` has none. */
export const rangeStartOf = (range: DoneRange, now: number): number => {
  switch (range) {
    case 'today':
      return startOfDay(now)
    case 'week': {
      const day = new Date(startOfDay(now))
      return day.setDate(day.getDate() - DAYS_BEFORE_TODAY_IN_WEEK)
    }
    case 'all':
      return -Infinity
    default: {
      const unhandled: never = range
      throw new Error(`Unhandled done range: ${unhandled}`)
    }
  }
}

export const withinRange = (done: DoneSession[], range: DoneRange, now: number): DoneSession[] => {
  const start = rangeStartOf(range, now)
  return done.filter((entry) => entry.finishedAt >= start)
}

/** `claude-haiku-4-5-20251001` → `haiku`; a model without a known family is `other`. */
export const modelFamilyOf = (model: string): ModelFamily => {
  const name = model.toLowerCase()
  if (name.includes('opus')) return 'opus'
  if (name.includes('sonnet')) return 'sonnet'
  if (name.includes('haiku')) return 'haiku'
  return 'other'
}

/**
 * The overview's one list of finished chats. Unseen ones lead in finish order whatever the range,
 * so a chat that finished yesterday unseen still shows its number; the rest follow newest first.
 */
export const rankedDoneOf = (
  done: DoneSession[],
  ranks: Map<string, number>,
  range: DoneRange,
  now: number
): RankedDone[] => {
  const rankOf = ({ source }: DoneSession) =>
    source.kind === 'tab' ? (ranks.get(source.tabId) ?? null) : null
  const unseen = done
    .flatMap((entry) => {
      const rank = rankOf(entry)
      return rank === null ? [] : [{ ...entry, rank }]
    })
    .sort((a, b) => a.rank - b.rank)
  const seen = withinRange(done, range, now).flatMap((entry) =>
    rankOf(entry) === null ? [{ ...entry, rank: null }] : []
  )
  return [...unseen, ...seen]
}

/** How many cards fit side by side in a grid this wide, in px: one on a phone, at most three. */
export const gridColumnsOf = (width: number): number =>
  Math.min(
    MAX_GRID_COLUMNS,
    Math.max(1, Math.floor((width + GRID_GAP_PX) / (MIN_CARD_WIDTH_PX + GRID_GAP_PX)))
  )

/** Free places that fill the last row; none when nothing runs or the row is full. */
export const ghostCountOf = (cards: number, columns: number): number =>
  cards === 0 ? 0 : (columns - (cards % columns)) % columns
