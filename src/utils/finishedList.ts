import type { Machine } from '@/api/services/agentd.service'
import type { RankedDone } from '@/utils/overview'
import { folderNameOf, startOfDay } from '@/utils/sessionList'

/** How the overview's "done" list is ordered; `newest` lets the unseen chats lead their day. */
export const finishedSortList = ['newest', 'oldest', 'title', 'folder'] as const
export type FinishedSort = (typeof finishedSortList)[number]
export const DEFAULT_FINISHED_SORT: FinishedSort = 'newest'

/**
 * A filter that lets every row through; also what an empty or missing query parameter means. Not
 * `''`: a select item cannot carry that, and the select shows this value as "all".
 */
export const ALL_FILTER = '*'
/** The filter value of this machine, whose `Machine` is `null`; no SSH host alias starts with `@`. */
export const LOCAL_MACHINE_FILTER = '@local'

/** Which account and machine the list shows; `ALL_FILTER` stands for any. */
export interface FinishedFilters {
  account: string
  machine: string
}

/** What the search looks at in one row; every field is plain text. */
export interface SearchableDone {
  key: string
  title: string
  summary: string
  folder: string
  account: string
  machine: string
}

/** `?sort=` from the URL; anything else is the default. */
export const parseFinishedSort = (value: unknown): FinishedSort =>
  finishedSortList.find((sort) => sort === value) ?? DEFAULT_FINISHED_SORT

/** `?account=` or `?machine=` from the URL; a list, an empty or a missing value lets everything through. */
export const parseFilter = (value: unknown): string =>
  (typeof value === 'string' && value.trim()) || ALL_FILTER

/** `?q=` from the URL, as typed: trimming here would eat the space between two words. */
export const parseSearch = (value: unknown): string => (typeof value === 'string' ? value : '')

export const machineFilterOf = (machine: Machine): string => machine ?? LOCAL_MACHINE_FILTER

export const filterFinished = (rows: RankedDone[], filters: FinishedFilters): RankedDone[] =>
  rows.filter(
    (row) =>
      (filters.account === ALL_FILTER || row.account === filters.account) &&
      (filters.machine === ALL_FILTER || machineFilterOf(row.machine) === filters.machine)
  )

const choicesOf = (values: string[], active: string, collator: Intl.Collator): string[] =>
  [...new Set(active === ALL_FILTER ? values : [...values, active])].sort(collator.compare)

/**
 * The accounts and machines the rows come from, each once and in alphabetical order. An active
 * filter stays a choice even without rows, so a stale link still names what it filters by.
 */
export const filterOptionsOf = (
  rows: RankedDone[],
  active: FinishedFilters,
  collator: Intl.Collator
): { accounts: string[]; machines: string[] } => ({
  accounts: choicesOf(
    rows.map((row) => row.account),
    active.account,
    collator
  ),
  machines: choicesOf(
    rows.map((row) => machineFilterOf(row.machine)),
    active.machine,
    collator
  )
})

const byNewest = (a: RankedDone, b: RankedDone) => b.finishedAt - a.finishedAt
const byNewestDay = (a: RankedDone, b: RankedDone) =>
  startOfDay(b.finishedAt) - startOfDay(a.finishedAt)
// An unseen chat leads its day by its finish number, as in the sidebar's groups; the seen ones have none.
const byRank = (a: RankedDone, b: RankedDone) =>
  (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY)

/** The rows in the chosen order; ties go to the newer one. A new array, the input stays as is. */
export const sortFinished = (
  rows: RankedDone[],
  sort: FinishedSort,
  collator: Intl.Collator
): RankedDone[] => {
  const sorted = [...rows]
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => byNewestDay(a, b) || byRank(a, b) || byNewest(a, b))
    case 'oldest':
      return sorted.sort((a, b) => a.finishedAt - b.finishedAt)
    case 'title':
      return sorted.sort((a, b) => collator.compare(a.title, b.title) || byNewest(a, b))
    case 'folder':
      return sorted.sort(
        (a, b) => collator.compare(folderNameOf(a.cwd), folderNameOf(b.cwd)) || byNewest(a, b)
      )
    default: {
      const unhandled: never = sort
      throw new Error(`Unhandled finished sort: ${unhandled}`)
    }
  }
}

/** The orders by finish time; only they split the list into days. */
const DATE_SORTS: readonly FinishedSort[] = ['newest', 'oldest']

/** Rows of one day while the list is ordered by date; `day` is `null` for one list without days. */
export interface FinishedSection {
  key: string
  day: number | null
  rows: RankedDone[]
}

/**
 * The sorted rows cut into one section per day they finished, in the order they come. Ordered by
 * title or folder, a day heading would split the alphabet, so the rows stay one section.
 */
export const sectionsOf = (rows: RankedDone[], sort: FinishedSort): FinishedSection[] => {
  if (!DATE_SORTS.includes(sort)) return rows.length ? [{ key: 'all', day: null, rows }] : []
  const sections: FinishedSection[] = []
  for (const row of rows) {
    const day = startOfDay(row.finishedAt)
    const last = sections.at(-1)
    if (last?.day === day) last.rows.push(row)
    else sections.push({ key: String(day), day, rows: [row] })
  }
  return sections
}

/** How a day heading names its day: two words for the last two days, a date for the rest. */
export const dayKindList = ['today', 'yesterday', 'this_year', 'older'] as const
export type DayKind = (typeof dayKindList)[number]

export const dayKindOf = (day: number, now: number): DayKind => {
  const today = startOfDay(now)
  if (day >= today) return 'today'
  const yesterday = new Date(today)
  if (day >= yesterday.setDate(yesterday.getDate() - 1)) return 'yesterday'
  return new Date(day).getFullYear() === new Date(now).getFullYear() ? 'this_year' : 'older'
}
