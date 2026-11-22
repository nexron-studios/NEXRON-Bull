import { MAX_USAGE_DAYS, dayKeyOf, projectNameOf, totalOf, type MachineUsage } from '@/utils/usage'

/** 53 weeks: a full year, whatever weekday today is. */
export const ACTIVITY_WEEKS = 53
export const ACTIVITY_DAYS = Math.min(ACTIVITY_WEEKS * 7, MAX_USAGE_DAYS)
/** The project and tool lists look at the last month only. */
export const RECENT_DAYS = 30

const DAYS_PER_WEEK = 7
const PROJECTS_PER_DAY = 3
const TOP_PROJECTS = 5
const MCP_PREFIX = 'mcp__'

export const activityMetricList = ['tokens', 'sessions', 'tools'] as const
export type ActivityMetric = (typeof activityMetricList)[number]

/** 0 is a day without use, 4 the busiest quarter of the active days. */
export type ActivityLevel = 0 | 1 | 2 | 3 | 4

export interface ActivityDay {
  /** `YYYY-MM-DD` */
  day: string
  tokens: number
  sessions: number
  tools: number
  /** The day's biggest projects by tokens, folder names */
  projects: string[]
}

export interface ProjectActivity {
  path: string
  name: string
  tokens: number
  sessions: number
}

export interface ToolActivity {
  /** The tool's name; an MCP server's tools count together under `mcp__<server>` */
  tool: string
  /** What a person reads: the tool, or the MCP server's short name */
  label: string
  calls: number
}

/** URL query → metric; anything else falls back to tokens. */
export const parseActivityMetric = (value: unknown): ActivityMetric => {
  const text = Array.isArray(value) ? value[0] : value
  return activityMetricList.find((metric) => metric === text) ?? 'tokens'
}

/**
 * The grid's columns: weeks from Monday to Sunday, oldest first, the last one holding today.
 * Days after today are `null`, so the last column ends where today is.
 */
export const activityWeeksOf = (today: Date, weeks = ACTIVITY_WEEKS): (string | null)[][] => {
  const todayKey = dayKeyOf(today)
  const mondayOffset = (today.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK
  const firstDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  firstDay.setDate(firstDay.getDate() - mondayOffset - (weeks - 1) * DAYS_PER_WEEK)
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: DAYS_PER_WEEK }, (_, weekday) => {
      const date = new Date(firstDay)
      date.setDate(firstDay.getDate() + week * DAYS_PER_WEEK + weekday)
      const key = dayKeyOf(date)
      return key > todayKey ? null : key
    })
  )
}

/** For each week where a month begins: the week's index and that month (0 = January). */
export const monthStartsOf = (weeks: (string | null)[][]): { week: number; month: number }[] =>
  weeks.flatMap((days, week) => {
    const first = days.find((day) => day?.endsWith('-01'))
    return first ? [{ week, month: Number(first.slice(5, 7)) - 1 }] : []
  })

const emptyDay = (day: string): ActivityDay => ({
  day,
  tokens: 0,
  sessions: 0,
  tools: 0,
  projects: []
})

/** Every day that saw use, across all machines. */
export const activityDaysOf = (machines: MachineUsage[]): Map<string, ActivityDay> => {
  const days = new Map<string, ActivityDay>()
  const projectTokens = new Map<string, Map<string, number>>()
  const dayOf = (day: string): ActivityDay => {
    const found = days.get(day)
    if (found) return found
    const created = emptyDay(day)
    days.set(day, created)
    return created
  }
  for (const { rows, tools, sessions } of machines) {
    for (const row of rows) {
      const tokens = totalOf(row)
      dayOf(row.day).tokens += tokens
      const perProject = projectTokens.get(row.day) ?? new Map<string, number>()
      perProject.set(row.project, (perProject.get(row.project) ?? 0) + tokens)
      projectTokens.set(row.day, perProject)
    }
    for (const row of tools) dayOf(row.day).tools += row.calls
    for (const row of sessions) dayOf(row.day).sessions += row.sessions
  }
  for (const [day, perProject] of projectTokens) {
    dayOf(day).projects = [...perProject.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, PROJECTS_PER_DAY)
      .map(([path]) => projectNameOf(path))
  }
  return days
}

export const valueOf = (day: ActivityDay | undefined, metric: ActivityMetric): number =>
  day ? day[metric] : 0

const quantileOf = (sorted: number[], share: number): number =>
  sorted[Math.floor((sorted.length - 1) * share)]

/** The upper bounds of levels 1 to 3: quartiles of the days with use. */
export const levelBoundsOf = (values: number[]): [number, number, number] => {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return [0, 0, 0]
  return [quantileOf(sorted, 0.25), quantileOf(sorted, 0.5), quantileOf(sorted, 0.75)]
}

export const levelOf = (value: number, bounds: [number, number, number]): ActivityLevel => {
  if (value <= 0) return 0
  if (value <= bounds[0]) return 1
  if (value <= bounds[1]) return 2
  if (value <= bounds[2]) return 3
  return 4
}

const isActive = (day: ActivityDay | undefined): boolean =>
  !!day && (day.tokens > 0 || day.sessions > 0)

/**
 * Days in a row with use. `axis` runs oldest to newest and ends with today; a today without use
 * yet does not break the current streak, the day is not over.
 */
export const streaksOf = (
  days: Map<string, ActivityDay>,
  axis: string[]
): { current: number; longest: number } => {
  let longest = 0
  let run = 0
  for (const day of axis) {
    run = isActive(days.get(day)) ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  const fromToday = isActive(days.get(axis.at(-1) ?? '')) ? axis : axis.slice(0, -1)
  const lastGap = fromToday.findLastIndex((day) => !isActive(days.get(day)))
  return { current: fromToday.length - 1 - lastGap, longest }
}

export const activeDayCountOf = (days: Map<string, ActivityDay>, axis: string[]): number =>
  axis.filter((day) => isActive(days.get(day))).length

/** The days of `axis` that saw use; the fetch reaches a few days further back than the grid. */
const daysOnAxis = (days: Map<string, ActivityDay>, axis: string[]): ActivityDay[] =>
  axis.flatMap((day) => days.get(day) ?? [])

/** The day of `axis` with the most of `metric`; `null` while nothing was used. */
export const peakDayOf = (
  days: Map<string, ActivityDay>,
  axis: string[],
  metric: ActivityMetric
): ActivityDay | null =>
  daysOnAxis(days, axis).reduce<ActivityDay | null>(
    (peak, day) => (day[metric] > (peak ? peak[metric] : 0) ? day : peak),
    null
  )

/** Tokens and sessions of the days on `axis`. */
export const totalsOf = (
  days: Map<string, ActivityDay>,
  axis: string[]
): { tokens: number; sessions: number } =>
  daysOnAxis(days, axis).reduce(
    (sum, day) => ({ tokens: sum.tokens + day.tokens, sessions: sum.sessions + day.sessions }),
    { tokens: 0, sessions: 0 }
  )

/** The projects worked on since `firstDay`, by tokens, biggest first. */
export const recentProjectsOf = (
  machines: MachineUsage[],
  firstDay: string,
  top = TOP_PROJECTS
): ProjectActivity[] => {
  const byPath = new Map<string, ProjectActivity>()
  const projectOf = (path: string): ProjectActivity => {
    const found = byPath.get(path)
    if (found) return found
    const created = { path, name: projectNameOf(path), tokens: 0, sessions: 0 }
    byPath.set(path, created)
    return created
  }
  for (const { rows, sessions } of machines) {
    for (const row of rows) if (row.day >= firstDay) projectOf(row.project).tokens += totalOf(row)
    for (const row of sessions)
      if (row.day >= firstDay) projectOf(row.project).sessions += row.sessions
  }
  return [...byPath.values()]
    .filter((project) => project.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, top)
}

/** Claude.ai connectors and plugins put their namespace before the server's own name. */
const MCP_NAMESPACE = /^(claude_ai_|plugin_[^_]+_)/

/**
 * `mcp__claude_ai_Google_Calendar__list_events` → `Google Calendar`; other tools keep their name.
 * The same server reached as a connector and as a plugin reads the same.
 */
const toolLabelOf = (tool: string): string => {
  if (!tool.startsWith(MCP_PREFIX)) return tool
  const server = tool.slice(MCP_PREFIX.length).split('__')[0] ?? tool
  return server.replace(MCP_NAMESPACE, '').replaceAll('_', ' ')
}

/** One entry per tool, one per MCP server however it is reached. */
const toolGroupOf = (tool: string): string =>
  tool.startsWith(MCP_PREFIX) ? `${MCP_PREFIX}${toolLabelOf(tool).toLowerCase()}` : tool

/** Every tool call since `firstDay`, per tool or MCP server, most called first. */
export const recentToolsOf = (machines: MachineUsage[], firstDay: string): ToolActivity[] => {
  const groups = new Map<string, ToolActivity>()
  for (const { tools } of machines)
    for (const row of tools) {
      if (row.day < firstDay) continue
      const key = toolGroupOf(row.tool)
      const label = toolLabelOf(row.tool)
      const group = groups.get(key) ?? { tool: key, label, calls: 0 }
      group.calls += row.calls
      // A connector writes `Figma`, a plugin `figma`; capitals sort first and read better.
      if (label < group.label) group.label = label
      groups.set(key, group)
    }
  return [...groups.values()].sort((a, b) => b.calls - a.calls)
}

export const TOP_TOOL_COUNT = 6

/** The calendar day `days - 1` days before `today`, as agentd writes days. */
export const dayBefore = (today: Date, days: number): string => {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  date.setDate(date.getDate() - (days - 1))
  return dayKeyOf(date)
}
