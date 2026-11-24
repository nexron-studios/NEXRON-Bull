import type { DiffLine } from '@/utils/diffRows'

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
