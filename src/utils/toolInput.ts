import type { PatchHunk } from '@/types/agentd.type'

export interface DiffLine {
  sign: '+' | '-'
  text: string
}

const linesOf = (value: unknown, sign: DiffLine['sign']): DiffLine[] =>
  typeof value === 'string' ? value.split('\n').map((text) => ({ sign, text })) : []

const editLines = (edit: unknown): DiffLine[] => {
  if (typeof edit !== 'object' || edit === null) return []
  const { old_string: before, new_string: after } = edit as Record<string, unknown>
  return [...linesOf(before, '-'), ...linesOf(after, '+')]
}

/**
 * A file change as removed and added lines, so the tool card shows a diff instead of JSON.
 * `null` for tools that change no file content.
 */
export const diffOf = (name: string, input: Record<string, unknown>): DiffLine[] | null => {
  switch (name) {
    case 'Edit':
      return editLines(input)
    case 'MultiEdit':
      return Array.isArray(input.edits) ? input.edits.flatMap(editLines) : []
    case 'Write':
      return linesOf(input.content, '+')
    default:
      return null
  }
}

/** One line of a diff as the card draws it; `number` is the line in the file, when it is known. */
export type DiffRow =
  | { kind: 'line'; sign: DiffLine['sign'] | ' '; number: number | null; text: string }
  /** Unchanged lines between two hunks */
  | { kind: 'gap' }

const MARKS: Record<string, DiffLine['sign'] | ' '> = { '+': '+', '-': '-', ' ': ' ' }

/**
 * Claude Code's `structuredPatch` as rows with line numbers and the context around each change:
 * a removed line counts in the old file, an added or unchanged one in the new file.
 */
export const patchRowsOf = (patch: PatchHunk[]): DiffRow[] =>
  patch.flatMap((hunk, index) => {
    let oldLine = hunk.old_start
    let newLine = hunk.new_start
    const rows: DiffRow[] = hunk.lines.map((line) => {
      const sign = MARKS[line.charAt(0)] ?? ' '
      const number = sign === '-' ? oldLine++ : newLine++
      if (sign === ' ') oldLine++
      return { kind: 'line', sign, number, text: line.slice(1) }
    })
    return index ? [{ kind: 'gap' as const }, ...rows] : rows
  })

/** The input's own lines when no patch came: no numbers and no context, they are not known. */
export const inputRowsOf = (lines: DiffLine[]): DiffRow[] =>
  lines.map(({ sign, text }) => ({ kind: 'line', sign, number: null, text }))

/** Added and removed lines, for the `+3 −1` in the card's head. */
export const diffCountsOf = (rows: DiffRow[]): { added: number; removed: number } => ({
  added: rows.filter((row) => row.kind === 'line' && row.sign === '+').length,
  removed: rows.filter((row) => row.kind === 'line' && row.sign === '-').length
})
