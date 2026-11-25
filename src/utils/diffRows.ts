import type { PatchHunk } from '@/types/agentd.type'

/**
 * One model for every diff the app draws: the tool cards in the chat and the diff review. Patches
 * (Claude Code's `structuredPatch`, git's hunks from agentd) are parsed once into hunks; a call's
 * own lines become a hunk without line numbers. Rows, counts and the look all come from there.
 */

export const diffSignList = ['+', '-', ' '] as const
export type DiffSign = (typeof diffSignList)[number]

export interface DiffLine {
  sign: DiffSign
  text: string
}

/** A start is `null` when the chat recorded no line numbers for the change. */
export interface DiffHunk {
  old_start: number | null
  new_start: number | null
  lines: DiffLine[]
}

export interface DiffLineRow {
  kind: 'line'
  /** Position among all lines of the diff */
  index: number
  sign: DiffSign
  /** The line in the old file; `null` for an added line or without numbers */
  old: number | null
  /** The line in the new file; `null` for a removed line or without numbers */
  new: number | null
  text: string
}

/** A line, or the unchanged lines between two hunks that never came */
export type DiffRow = DiffLineRow | { kind: 'gap' }

export const DIFF_ROW_CLASS: Record<DiffSign, string> = {
  '+': 'bg-good/10 text-foreground',
  '-': 'bg-critical/10 text-foreground',
  ' ': 'text-subtle'
}
export const DIFF_MARK_CLASS: Record<DiffSign, string> = {
  '+': 'text-good',
  '-': 'text-critical',
  ' ': ''
}

const signOf = (mark: string): DiffSign => diffSignList.find((sign) => sign === mark) ?? ' '

/** A patch's lines carry their mark in front (`+a`, `-b`, ` c`). */
export const hunksOfPatch = (patch: PatchHunk[]): DiffHunk[] =>
  patch.map(({ old_start, new_start, lines }) => ({
    old_start,
    new_start,
    lines: lines.map((line) => ({ sign: signOf(line.charAt(0)), text: line.slice(1) }))
  }))

/**
 * One Edit, MultiEdit or Write: Claude Code's patch when it sent one, else the call's own lines.
 * A Write without patch created the file, so its lines are the whole file from line 1.
 */
export const hunksOfChange = (
  tool: string,
  lines: DiffLine[],
  patch: PatchHunk[] | undefined
): DiffHunk[] => {
  if (patch?.length) return hunksOfPatch(patch)
  if (!lines.length) return []
  if (tool === 'Write') return [{ old_start: 0, new_start: 1, lines }]
  return [{ old_start: null, new_start: null, lines }]
}

/** The same lines without numbers, for changes a later one may have moved. */
export const withoutNumbers = (hunks: DiffHunk[]): DiffHunk[] =>
  hunks.map((hunk) => ({ ...hunk, old_start: null, new_start: null }))

/**
 * Every line numbered in the old and the new file: a removed line counts in the old one, an added
 * one in the new one, an unchanged one in both. A gap between two hunks.
 */
export const rowsOfHunks = (hunks: DiffHunk[]): DiffRow[] => {
  let index = 0
  return hunks.flatMap((hunk, at) => {
    let old = hunk.old_start
    let next = hunk.new_start
    const lines = hunk.lines.map(({ sign, text }): DiffLineRow => ({
      kind: 'line',
      index: index++,
      sign,
      old: sign === '+' || old === null ? null : old++,
      new: sign === '-' || next === null ? null : next++,
      text
    }))
    return at ? [{ kind: 'gap' as const }, ...lines] : lines
  })
}

/**
 * Where the hunks start and how many lines each has: equal for a diff read again unchanged, so
 * what was chosen in it can stay.
 */
export const shapeOf = (hunks: DiffHunk[]): string =>
  hunks.map((hunk) => `${hunk.old_start},${hunk.new_start},${hunk.lines.length}`).join(';')

/** Added and removed lines, for the `+3 −1` in a head. */
export const countsOf = (hunks: DiffHunk[]): { added: number; removed: number } => {
  const signs = hunks.flatMap((hunk) => hunk.lines.map((line) => line.sign))
  return {
    added: signs.filter((sign) => sign === '+').length,
    removed: signs.filter((sign) => sign === '-').length
  }
}
