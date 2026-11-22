import type {
  ModelFamily,
  SessionCountRow,
  TokenCounts,
  ToolUseRow,
  UsageRow
} from '@/types/agentd.type'

export const usageRangeList = [7, 14, 30] as const
export type UsageRange = (typeof usageRangeList)[number]
export const DEFAULT_USAGE_RANGE: UsageRange = 14

/** The families the chart and table show as their own series; `other` folds into the total. */
export const shownFamilyList = ['opus', 'sonnet', 'haiku'] as const
export type ShownFamily = (typeof shownFamilyList)[number]

export type TokensByFamily = Record<ModelFamily, number>

/** The series token of each family as a Tailwind class, written out so Tailwind finds it. */
export const SERIES_BG_CLASS: Record<ModelFamily, string> = {
  opus: 'bg-series-opus',
  sonnet: 'bg-series-sonnet',
  haiku: 'bg-series-haiku',
  other: 'bg-series-other'
}

/** What agentd counted in a range of days. */
export interface UsageReport {
  rows: UsageRow[]
  tools: ToolUseRow[]
  sessions: SessionCountRow[]
}

/** Rows of one machine; `machine` is `null` for this computer. */
export interface MachineUsage extends UsageReport {
  machine: string | null
}

export interface DayTokens {
  /** `YYYY-MM-DD` */
  day: string
  byFamily: TokensByFamily
  total: number
}

export interface ProjectShare {
  /** Full working folder, `''` when the transcript named none, `null` for the rest folded together */
  path: string | null
  /** Last folder name, what a person recognises */
  name: string
  tokens: number
  /** 0…1 of the range total */
  share: number
}

export interface MachineTokens {
  machine: string | null
  byFamily: TokensByFamily
  total: number
}

/** agentd's `MAX_DAYS`: a year of weeks, for the overview's activity grid. */
export const MAX_USAGE_DAYS = 371
const TOP_PROJECTS = 5

/** URL query → range; anything else falls back to the default. */
export const parseUsageRange = (value: unknown): UsageRange => {
  const number = Number(Array.isArray(value) ? value[0] : value)
  return usageRangeList.find((range) => range === number) ?? DEFAULT_USAGE_RANGE
}

/** Everything Claude processed: fresh input, output and both cache directions. */
export const totalOf = (tokens: TokenCounts): number =>
  tokens.input + tokens.output + tokens.cache_read + tokens.cache_write

const emptyFamilies = (): TokensByFamily => ({ opus: 0, sonnet: 0, haiku: 0, other: 0 })

const twoDigits = (value: number) => String(value).padStart(2, '0')

/** Local calendar day as agentd writes it. */
export const dayKeyOf = (date: Date): string =>
  `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`

/** The last `days` local days, oldest first, ending with `today`. */
export const dayAxis = (days: number, today: Date): string[] =>
  Array.from({ length: Math.min(days, MAX_USAGE_DAYS) }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    date.setDate(date.getDate() - (days - 1 - index))
    return dayKeyOf(date)
  })

const allRows = (machines: MachineUsage[]): UsageRow[] => machines.flatMap((m) => m.rows)

/** Only the rows of the given days, so every figure of the page sums the same range. */
export const withinDays = (machines: MachineUsage[], axis: string[]): MachineUsage[] => {
  const days = new Set(axis)
  return machines.map(({ machine, rows, tools, sessions }) => ({
    machine,
    rows: rows.filter((row) => days.has(row.day)),
    tools: tools.filter((row) => days.has(row.day)),
    sessions: sessions.filter((row) => days.has(row.day))
  }))
}

/** One column per day of the axis, days without use included as zero. */
export const tokensPerDay = (machines: MachineUsage[], axis: string[]): DayTokens[] => {
  const byDay = new Map(axis.map((day) => [day, emptyFamilies()]))
  for (const row of allRows(machines)) {
    const families = byDay.get(row.day)
    if (families) families[row.model] += totalOf(row)
  }
  return axis.map((day) => {
    const byFamily = byDay.get(day) ?? emptyFamilies()
    return { day, byFamily, total: Object.values(byFamily).reduce((sum, n) => sum + n, 0) }
  })
}

export const sumOfDays = (days: DayTokens[]): number =>
  days.reduce((sum, day) => sum + day.total, 0)

/** `C:\me\dev\projects\bull` → `bull`; a root folder keeps its full path. */
export const projectNameOf = (path: string): string =>
  path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

/** The biggest projects of the range, the rest folded into one entry, biggest first. */
export const projectShares = (machines: MachineUsage[], top = TOP_PROJECTS): ProjectShare[] => {
  const byPath = new Map<string, number>()
  for (const row of allRows(machines))
    byPath.set(row.project, (byPath.get(row.project) ?? 0) + totalOf(row))
  const total = [...byPath.values()].reduce((sum, n) => sum + n, 0)
  if (total === 0) return []
  const sorted = [...byPath.entries()].sort((a, b) => b[1] - a[1])
  const shares: ProjectShare[] = sorted.slice(0, top).map(([path, tokens]) => ({
    path,
    name: projectNameOf(path),
    tokens,
    share: tokens / total
  }))
  const rest = sorted.slice(top).reduce((sum, [, tokens]) => sum + tokens, 0)
  if (rest > 0) shares.push({ path: null, name: '', tokens: rest, share: rest / total })
  return shares
}

export const tokensPerMachine = (machines: MachineUsage[]): MachineTokens[] =>
  machines.map(({ machine, rows }) => {
    const byFamily = emptyFamilies()
    for (const row of rows) byFamily[row.model] += totalOf(row)
    return { machine, byFamily, total: Object.values(byFamily).reduce((sum, n) => sum + n, 0) }
  })

/** Every how many days an axis label fits: about `slots` labels across the axis. */
export const labelStepOf = (days: number, slots: number): number =>
  Math.max(1, Math.ceil(days / slots))
