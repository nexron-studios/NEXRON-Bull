import type { SessionSummaryProps } from '@/types/agentd.type'
import { activityOfTab } from '@/utils/activity'
import { openQuestionOf } from '@/utils/answerCallouts'
import {
  isBusyStatus,
  listedTabOf,
  turnMessagesOf,
  type ChatTabState,
  type TabStatus
} from '@/utils/chatTab'
import { askReasonOf } from '@/utils/notifications'
import { applyManualOrder } from '@/utils/order'
import { shortTarget } from '@/utils/toolKind'
import { resultsByToolId } from '@/utils/toolPairs'
import { summarizeToolInput } from '@/utils/toolSummary'

/** The sidebar's groups, in the order they are shown: what needs the user comes first. */
export const sessionGroupList = ['needs', 'running', 'empty', 'waiting', 'done'] as const
export type SessionGroup = (typeof sessionGroupList)[number]

/** Shown even when empty, with a line saying so (Figma "02 Desktop"); the others come and go. */
export const alwaysShownGroupList = ['needs', 'running', 'done'] as const
export type AlwaysShownGroup = (typeof alwaysShownGroupList)[number]

export const isAlwaysShownGroup = (group: SessionGroup): group is AlwaysShownGroup =>
  alwaysShownGroupList.some((shown) => shown === group)

/**
 * Whether the user may drag the rows of a group into their own order. Finished rows stay in the
 * order they finished, newest first (20.11.2026); an order of history would only go stale.
 */
export const isSortableGroup = (group: SessionGroup): boolean => {
  switch (group) {
    case 'needs':
    case 'running':
      return true
    case 'empty':
    case 'waiting':
    case 'done':
      return false
    default: {
      const unhandled: never = group
      throw new Error(`Unhandled session group: ${unhandled}`)
    }
  }
}

/** One group of the list with its rows in display order. */
export interface SessionGroupEntry {
  group: SessionGroup
  rows: SessionRow[]
}

/**
 * One line in the session list: an open tab. Closed sessions live in the overview's "Fertig" list,
 * not here (21.11.2026).
 */
export interface SessionRow {
  /** The tab id */
  key: string
  tab: ChatTabState
  title: string
  folder: string
  account: string
  status: TabStatus
  group: SessionGroup
  /** Running since (needs, running) or finished at (done), in ms; `null` when unknown */
  since: number | null
}

/** The part of a row the search looks at. */
export interface SearchableRow {
  key: string
  title: string
  folder: string
  /** The name the row and the Agent Dashboard show, empty before Claude gave the tab an ID */
  chatName: string
  account: string
}

/** What a busy row says under its title, after the thinking bar. */
export type RowActivity =
  | { kind: 'tool'; tool: string; target: string }
  | { kind: 'ask'; reason: 'question' | 'plan' }
  | { kind: 'state'; state: 'thinking' | 'writing' | 'working' }

const PATH_SEPARATOR = /[\\/]/

/** The last folder of a path, the name the user knows the project by. */
export const folderNameOf = (cwd: string): string =>
  cwd.split(PATH_SEPARATOR).filter(Boolean).at(-1) ?? cwd

export const startOfDay = (now: number): number => new Date(now).setHours(0, 0, 0, 0)

const CHAT_NAME_ID_LENGTH = 4

/**
 * The fixed name of a chat (`nexron-chat-1a87`): agentd starts Claude with it (`chat_name` in
 * `agentd/src/claude.rs`), so the Agent Dashboard and other sessions call the chat the same.
 */
export const chatNameOf = (cwd: string, sessionId: string): string =>
  `${folderNameOf(cwd)}${chatNameSuffixOf(sessionId)}`

/** The part of the name that tells chats in one folder apart, kept whole when the name truncates. */
export const chatNameSuffixOf = (sessionId: string): string =>
  `-${sessionId.slice(0, CHAT_NAME_ID_LENGTH)}`

/**
 * One transcript: a session moved to another account exists in both profiles under the same id.
 * The account label, not the profile folder: a tab of the default profile has no folder.
 */
export const sessionKeyOf = (account: string, sessionId: string): string =>
  `${account}:${sessionId}`

// Idle means Claude answered in this run of the app, so today unless it ran overnight; an ended
// tab only counts when its finish time says so.
const isFinishedToday = (tab: ChatTabState, finishedAt: number | null, today: number): boolean =>
  tab.status === 'idle'
    ? finishedAt === null || finishedAt >= today
    : finishedAt !== null && finishedAt >= today

/**
 * The chat ended today on a question the user has not answered. An older one is history: a chat
 * from days ago must not hold the sidebar's "needs" or the machine's dot.
 */
export const waitsForAnswer = (tab: ChatTabState, now: number): boolean =>
  !isBusyStatus(tab.status) &&
  isFinishedToday(tab, tab.finishedAt, startOfDay(now)) &&
  openQuestionOf(tab) !== null

/**
 * An open chat nobody wrote in yet: Clawd waits for the first prompt (Figma "39 Übersicht").
 * Only a transcript known to be empty, never one still loading. A new tab is `starting` until
 * Claude is up; that is no work yet, so it waits here instead of flashing through "running".
 */
export const isEmptyChat = (tab: ChatTabState): boolean =>
  tab.status !== 'working' &&
  tab.status !== 'asking' &&
  tab.notice === null &&
  tab.history === 'loaded' &&
  tab.messages.length === 0 &&
  tab.pending.length === 0 &&
  !tab.hasMore

const groupOfTab = (tab: ChatTabState, finishedAt: number | null, today: number): SessionGroup => {
  // A full account outranks the turn's own state: nothing happens here until the reset.
  if (tab.limit.kind === 'waiting') return 'waiting'
  if (isEmptyChat(tab)) return 'empty'
  switch (tab.status) {
    case 'asking':
      return 'needs'
    case 'working':
    case 'starting':
      return 'running'
    case 'idle':
    case 'ended':
      // An answer from today that ends on a question waits for the user, like an approval does.
      // Every other finished tab is "done", whatever day it finished (25.11.2026).
      return openQuestionOf(tab) && isFinishedToday(tab, finishedAt, today) ? 'needs' : 'done'
    default: {
      const unhandled: never = tab.status
      throw new Error(`Unhandled tab status: ${unhandled}`)
    }
  }
}

/**
 * `tab` stays the real one for the row's actions; group, status and times come from the tab as
 * lists show it. `modified` holds the newest transcript time per session id: a moved session has a
 * copy in every account it was in, and only the newest is the chat's.
 */
const rowOfTab = (tab: ChatTabState, modified: Map<string, number>, today: number): SessionRow => {
  const listed = listedTabOf(tab)
  // A tab restored after a restart has no finish time; its transcript's last change stands in.
  const transcriptTime = tab.sessionId ? modified.get(tab.sessionId) : undefined
  const finishedAt = tab.finishedAt ?? transcriptTime ?? null
  const group = groupOfTab(listed, finishedAt, today)
  // An open question also waits under "needs", but its time is when the answer came.
  const isBusy = group === 'running' || (group === 'needs' && isBusyStatus(listed.status))
  return {
    key: tab.id,
    tab,
    title: tab.title,
    folder: folderNameOf(tab.cwd),
    account: tab.account,
    status: listed.status,
    group,
    since: isBusy ? (tab.turn?.startedAt ?? null) : finishedAt
  }
}

/**
 * The open tabs of one machine as rows. `recent` (the same machine's transcripts) only supplies the
 * finish time of a tab restored after a restart.
 */
export const sessionRowsOf = (
  tabs: ChatTabState[],
  recent: SessionSummaryProps[],
  now: number
): SessionRow[] => {
  const today = startOfDay(now)
  const modified = new Map<string, number>()
  for (const { session_id, modified_ms } of recent) {
    modified.set(session_id, Math.max(modified_ms, modified.get(session_id) ?? 0))
  }
  return tabs.map((tab) => rowOfTab(tab, modified, today))
}

// Waiting and running rows: longest first. Finished rows: newest first. Unknown times go last in
// every group, so a tab restored without a finish time never pushes fresh ones down.
const compareRows = (group: SessionGroup) => (a: SessionRow, b: SessionRow) => {
  const isOldestFirst = group === 'needs' || group === 'running'
  const unknown = isOldestFirst ? Infinity : -Infinity
  const left = a.since ?? unknown
  const right = b.since ?? unknown
  if (left === right) return 0
  return isOldestFirst ? left - right : right - left
}

/**
 * The rows by group, in display order; empty groups are left out unless `shownWhenEmpty` names
 * them. Search hits come `isRanked`: they keep their order, best match first, instead of being
 * sorted by time.
 */
export const groupRows = (
  rows: SessionRow[],
  isRanked = false,
  shownWhenEmpty: readonly SessionGroup[] = []
): SessionGroupEntry[] =>
  sessionGroupList
    .map((group) => {
      const members = rows.filter((row) => row.group === group)
      return { group, rows: isRanked ? members : members.sort(compareRows(group)) }
    })
    .filter((entry) => entry.rows.length > 0 || shownWhenEmpty.includes(entry.group))

/** The user's drag order inside the groups that keep one; the others stay as they are. */
export const withManualOrder = (
  entries: SessionGroupEntry[],
  order: string[]
): SessionGroupEntry[] =>
  entries.map((entry) =>
    isSortableGroup(entry.group) ? { ...entry, rows: applyManualOrder(entry.rows, order) } : entry
  )

/** What a machine's tabs are up to, most pressing first. */
export const machineActivityList = ['needs', 'running', 'done'] as const
export type MachineActivity = (typeof machineActivityList)[number]

/**
 * The most pressing state of a machine's tabs, for the dot on its segment. Only a turn that
 * ended today counts as done; a tab that merely ended or lost its connection says nothing.
 */
export const machineStateOf = (tabs: ChatTabState[], now: number): MachineActivity | null => {
  const listed = tabs.map(listedTabOf)
  if (listed.some((tab) => tab.status === 'asking' || waitsForAnswer(tab, now))) return 'needs'
  const isRunning = (tab: ChatTabState) =>
    tab.status === 'working' || (tab.status === 'starting' && !isEmptyChat(tab))
  if (listed.some(isRunning)) return 'running'
  const today = startOfDay(now)
  const isDone = listed.some((tab) => tab.finishedAt !== null && tab.finishedAt >= today)
  return isDone ? 'done' : null
}

/** The most pressing of several machines' states, for a switch that shows only one machine. */
export const mostPressingOf = (states: (MachineActivity | null)[]): MachineActivity | null =>
  machineActivityList.find((activity) => states.includes(activity)) ?? null

/** What a waiting or running tab is doing right now; `null` once it is done. */
export const rowActivityOf = (tab: ChatTabState): RowActivity | null => {
  if (tab.permission) {
    const reason = askReasonOf(tab.permission.toolName)
    if (reason === 'question' || reason === 'plan') return { kind: 'ask', reason }
    const target = shortTarget(summarizeToolInput(tab.permission.input))
    return { kind: 'tool', tool: tab.permission.toolName, target }
  }
  if (openQuestionOf(tab)) return { kind: 'ask', reason: 'question' }
  if (tab.status !== 'working') return null
  // Only the running turn can hold the call in progress, so only its results are needed.
  const activity = activityOfTab(tab, resultsByToolId(turnMessagesOf(tab)))
  switch (activity.kind) {
    case 'tool':
      return { kind: 'tool', tool: activity.tool, target: activity.target }
    case 'asking':
      return null
    default:
      return { kind: 'state', state: activity.kind }
  }
}

export const searchableOf = (rows: SessionRow[]): SearchableRow[] =>
  rows.map(({ key, tab, title, folder, account }) => ({
    key,
    title,
    folder,
    chatName: tab.sessionId ? chatNameOf(tab.cwd, tab.sessionId) : '',
    account
  }))

/** True when the search would see the same rows; a streamed token changes none of these fields. */
export const isSameSearchable = (a: SearchableRow[], b: SearchableRow[]): boolean =>
  a.length === b.length &&
  a.every(
    (row, at) =>
      row.key === b[at].key &&
      row.title === b[at].title &&
      row.folder === b[at].folder &&
      row.chatName === b[at].chatName &&
      row.account === b[at].account
  )
