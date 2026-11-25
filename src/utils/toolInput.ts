import type { PatchHunk } from '@/types/agentd.type'
import { hunksOfPatch, type DiffHunk, type DiffLine } from '@/utils/diffRows'

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

/**
 * One Edit, MultiEdit or Write as hunks: Claude Code's patch when it sent one, else the call's own
 * lines without numbers. A Write without patch created the file, so its lines are the whole file
 * from line 1. `null` for tools that change no file content.
 */
export const hunksOfTool = (
  name: string,
  input: Record<string, unknown>,
  patch: PatchHunk[] | undefined
): DiffHunk[] | null => {
  const lines = diffOf(name, input)
  if (!lines) return null
  if (patch?.length) return hunksOfPatch(patch)
  if (!lines.length) return []
  if (name === 'Write') return [{ old_start: 0, new_start: 1, lines }]
  return [{ old_start: null, new_start: null, lines }]
}
