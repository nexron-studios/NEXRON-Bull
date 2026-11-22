import { ALL_PERCENT } from '@/utils/percent'

/**
 * What fills the context, grouped as the popover shows it (Figma "35"). Claude Code's own
 * categories (`get_context_usage`, the data behind `/context`) map onto these; one it adds later
 * lands in `other` until it gets a name here.
 */
export const contextGroupList = [
  'system_prompt',
  'tools',
  'mcp',
  'memory',
  'skills',
  'agents',
  'messages',
  'other'
] as const
export type ContextGroup = (typeof contextGroupList)[number]

const GROUP_OF_CATEGORY: Record<string, ContextGroup> = {
  system_prompt: 'system_prompt',
  system_tools: 'tools',
  mcp_tools: 'mcp',
  mcp_instructions: 'mcp',
  memory_files: 'memory',
  skills: 'skills',
  custom_agents: 'agents',
  messages: 'messages'
}

/** How Claude Code marks a category: in the context, loaded on demand only, held back, unused. */
const USED_KIND = 'used'
const BUFFER_KIND = 'buffer'
const FREE_KIND = 'free'

/** Claude Code warns this many tokens before it compacts on its own, like the terminal does. */
export const AUTO_COMPACT_WARNING_TOKENS = 20_000
const HIGH_CONTEXT_PERCENT = 85
const FULL_CONTEXT_PERCENT = 95

export interface ContextShare {
  group: ContextGroup
  tokens: number
}

/** A file Claude read into the context at start: a CLAUDE.md, a rule file it imports. */
export interface MemoryFile {
  path: string
  tokens: number
}

export interface ContextReport {
  tokens: number
  window: number
  /** `tokens` of `window`, rounded */
  percent: number
  /** What is in the context now, in the order of `contextGroupList`, empty groups left out */
  shares: ContextShare[]
  /** Kept free so Claude can still write the summary when it compacts */
  buffer: number
  free: number
  memoryFiles: MemoryFile[]
  /** Skill descriptions in the context; `null` when Claude Code did not say */
  skills: { count: number; tokens: number } | null
  /** Where Claude compacts on its own; `null` when auto-compact is off */
  autoCompactAt: number | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const memoryFilesOf = (value: unknown): MemoryFile[] =>
  (Array.isArray(value) ? value : []).flatMap((file) =>
    isRecord(file) && typeof file.path === 'string' && numberOf(file.tokens) !== null
      ? [{ path: file.path, tokens: file.tokens as number }]
      : []
  )

const skillsOf = (value: unknown): ContextReport['skills'] => {
  if (!isRecord(value)) return null
  const count = numberOf(value.includedSkills)
  const tokens = numberOf(value.tokens)
  return count === null || tokens === null ? null : { count, tokens }
}

/** Claude's answer to `get_context_usage`, checked where it enters; `null` if it is not one. */
export const contextReportOf = (response: unknown): ContextReport | null => {
  if (!isRecord(response) || !Array.isArray(response.categories)) return null
  const tokens = numberOf(response.totalTokens)
  const window = numberOf(response.maxTokens)
  if (tokens === null || !window) return null
  const totals = new Map<ContextGroup, number>()
  let buffer = 0
  let free = 0
  for (const category of response.categories) {
    if (!isRecord(category)) continue
    const amount = numberOf(category.tokens) ?? 0
    if (category.kind === BUFFER_KIND) buffer += amount
    if (category.kind === FREE_KIND) free += amount
    if (category.kind !== USED_KIND) continue
    const group = GROUP_OF_CATEGORY[String(category.id)] ?? 'other'
    totals.set(group, (totals.get(group) ?? 0) + amount)
  }
  const threshold = numberOf(response.autoCompactThreshold)
  return {
    tokens,
    window,
    percent: Math.round((tokens / window) * ALL_PERCENT),
    shares: contextGroupList.flatMap((group) => {
      const amount = totals.get(group) ?? 0
      return amount > 0 ? [{ group, tokens: amount }] : []
    }),
    buffer,
    free,
    memoryFiles: memoryFilesOf(response.memoryFiles),
    skills: skillsOf(response.skills),
    autoCompactAt: response.isAutoCompactEnabled === true ? threshold : null
  }
}

/** The ring's colour step: yellow from 85 %, red from 95 %. */
export const contextLevelOf = (percent: number): 'normal' | 'high' | 'full' => {
  if (percent >= FULL_CONTEXT_PERCENT) return 'full'
  if (percent >= HIGH_CONTEXT_PERCENT) return 'high'
  return 'normal'
}

/** Share of `window` as a width, never past the bar. */
export const widthPercentOf = (tokens: number, window: number): number =>
  Math.min(ALL_PERCENT, Math.max(0, (tokens / window) * ALL_PERCENT))

/**
 * How much room is left before Claude compacts on its own, as the terminal's "% until
 * auto-compact" counts it; `null` while it is still far off (more than the warning margin).
 */
export const autoCompactLeftOf = (tokens: number, autoCompactAt: number): number | null => {
  if (tokens < autoCompactAt - AUTO_COMPACT_WARNING_TOKENS) return null
  return Math.max(0, Math.round(((autoCompactAt - tokens) / autoCompactAt) * ALL_PERCENT))
}

const THOUSAND = 1_000
const MILLION = 1_000_000

/** Token counts as Claude Code's `/context` writes them: `812`, `3,1k`, `176k`, `1M`. */
export const tokenFormatterOf = (locale: string): ((tokens: number) => string) => {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return (tokens) => {
    if (tokens >= MILLION) return `${number.format(tokens / MILLION)}M`
    if (tokens >= THOUSAND) return `${number.format(tokens / THOUSAND)}k`
    return number.format(tokens)
  }
}

/** `/compact` with what the summary should keep, as Claude Code takes it. */
export const compactCommandOf = (focus: string): string => `/compact ${focus.trim()}`.trim()

const CLAUDE_FILE = /^CLAUDE(\.local)?\.md$/i
const HOME_PREFIX = /^(?:[A-Za-z]:)?\/(?:Users|home)\/[^/]+/

/** `C:\Users\me\.claude\CLAUDE.md` → `~/.claude/CLAUDE.md`. */
export const shortPathOf = (path: string): string =>
  path.replaceAll('\\', '/').replace(HOME_PREFIX, '~')

/** A row under "Loaded": one CLAUDE.md, or the other files of one folder (rules) together. */
export interface LoadedRow {
  path: string
  /** More than one file of a folder in one row */
  count: number
  tokens: number
}

/** CLAUDE.md files one by one, everything they import grouped by folder, in load order. */
export const loadedRowsOf = (files: MemoryFile[]): LoadedRow[] => {
  const rows: LoadedRow[] = []
  // The first file of each folder row: a folder that holds one file reads better as that file.
  const firstFiles = new Map<LoadedRow, string>()
  const folders = new Map<string, LoadedRow>()
  for (const file of files) {
    const path = shortPathOf(file.path)
    const cut = path.lastIndexOf('/')
    if (CLAUDE_FILE.test(path.slice(cut + 1))) {
      rows.push({ path, count: 1, tokens: file.tokens })
      continue
    }
    const folder = path.slice(0, cut)
    const row = folders.get(folder)
    if (row) {
      row.count += 1
      row.tokens += file.tokens
      continue
    }
    const added = { path: folder, count: 1, tokens: file.tokens }
    folders.set(folder, added)
    firstFiles.set(added, path)
    rows.push(added)
  }
  return rows.map((row) => {
    const first = firstFiles.get(row)
    return row.count === 1 && first ? { ...row, path: first } : row
  })
}
