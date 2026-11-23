import type { FileDiffProps, FileStatus, PatchHunk } from '@/types/agentd.type'
import type { DiffLine } from '@/utils/toolInput'

/**
 * The diff review (right panel › changed files): a file's hunks as numbered lines, long unchanged
 * stretches folded, and line comments formatted for the composer.
 */

/** Like Claude Code's `structuredPatch`; a start is `null` when the chat recorded no line numbers. */
export interface ReviewHunk {
  old_start: number | null
  new_start: number | null
  lines: string[]
}

export interface ReviewLine {
  kind: 'line'
  /** Position among all lines of the file's diff; selections and comments count in it */
  index: number
  sign: '+' | '-' | ' '
  old: number | null
  new: number | null
  text: string
}

export type ReviewRow =
  | ReviewLine
  /** Unchanged lines hidden until opened; `id` is the index of the first one */
  | { kind: 'fold'; id: number; lines: ReviewLine[] }
  /** Lines between two hunks that never came */
  | { kind: 'gap' }

/** Unchanged lines kept visible on each side of a change, as git does */
export const CONTEXT_LINES = 3
/** A shorter stretch is cheaper to show than to open */
export const MIN_FOLDED_LINES = 4

const SIGNS: Record<string, ReviewLine['sign']> = { '+': '+', '-': '-', ' ': ' ' }

/** The changes a chat recorded for one Edit, MultiEdit or Write call. */
export const chatHunksOf = (
  tool: string,
  lines: DiffLine[],
  patch: PatchHunk[] | undefined
): ReviewHunk[] => {
  if (patch?.length) return patch
  if (!lines.length) return []
  const text = lines.map(({ sign, text }) => `${sign}${text}`)
  // A Write without patch created the file: its lines are the whole file.
  if (tool === 'Write') return [{ old_start: 0, new_start: 1, lines: text }]
  return [{ old_start: null, new_start: null, lines: text }]
}

/** Every line of the hunks, numbered in the old and the new file, a gap between two hunks. */
export const linesOf = (hunks: ReviewHunk[]): (ReviewLine | { kind: 'gap' })[] => {
  let index = 0
  return hunks.flatMap((hunk, at) => {
    let old = hunk.old_start
    let next = hunk.new_start
    const lines = hunk.lines.map((raw): ReviewLine => {
      const sign = SIGNS[raw.charAt(0)] ?? ' '
      const line: ReviewLine = {
        kind: 'line',
        index: index++,
        sign,
        old: sign === '+' || old === null ? null : old++,
        new: sign === '-' || next === null ? null : next++,
        text: raw.slice(1)
      }
      return line
    })
    return at ? [{ kind: 'gap' as const }, ...lines] : lines
  })
}

/**
 * Folds every unchanged stretch that is longer than its context: `CONTEXT_LINES` stay next to a
 * change, the rest is one fold unless `expanded` holds its id.
 */
export const foldRows = (
  rows: (ReviewLine | { kind: 'gap' })[],
  expanded: ReadonlySet<number>
): ReviewRow[] => {
  const out: ReviewRow[] = []
  let run: ReviewLine[] = []
  const flush = (isChangeAfter: boolean) => {
    const keepBefore = out.at(-1)?.kind === 'line' ? CONTEXT_LINES : 0
    const keepAfter = isChangeAfter ? CONTEXT_LINES : 0
    const hidden = run.slice(keepBefore, Math.max(keepBefore, run.length - keepAfter))
    const first = hidden[0]
    if (!first || hidden.length < MIN_FOLDED_LINES || expanded.has(first.index)) {
      out.push(...run)
    } else {
      out.push(...run.slice(0, keepBefore), { kind: 'fold', id: first.index, lines: hidden })
      out.push(...run.slice(keepBefore + hidden.length))
    }
    run = []
  }
  for (const row of rows) {
    if (row.kind === 'line' && row.sign === ' ') {
      run.push(row)
      continue
    }
    flush(row.kind === 'line')
    out.push(row)
  }
  flush(false)
  return out
}

export const countsOf = (lines: ReviewLine[]) => ({
  added: lines.filter((line) => line.sign === '+').length,
  removed: lines.filter((line) => line.sign === '-').length
})

/** A line can only be named in a comment when the file has a number for it. */
export const isCommentable = (line: ReviewLine) => line.new !== null || line.old !== null

export interface LineRange {
  start: number
  end: number
}

export const rangeOf = (anchor: number, focus: number): LineRange => ({
  start: Math.min(anchor, focus),
  end: Math.max(anchor, focus)
})

const spanOf = (numbers: number[]) => {
  const first = Math.min(...numbers)
  const last = Math.max(...numbers)
  return first === last ? `${first}` : `${first}-${last}`
}

/**
 * The lines a selection names: in the new file, or for removed lines only in the old one
 * (`isOld`), since those lines are no longer there. `null` when none has a number.
 */
export const lineSpanOf = (
  lines: ReviewLine[],
  range: LineRange
): { span: string; isOld: boolean } | null => {
  const chosen = lines.filter((line) => line.index >= range.start && line.index <= range.end)
  const current = chosen.flatMap((line) => (line.new === null ? [] : [line.new]))
  if (current.length) return { span: spanOf(current), isOld: false }
  const old = chosen.flatMap((line) => (line.old === null ? [] : [line.old]))
  return old.length ? { span: spanOf(old), isOld: true } : null
}

/** Where a file sits for the user: relative to the chat's folder, else its full path. */
export const displayPathOf = (path: string, cwd: string): string => {
  const slashed = path.replaceAll('\\', '/')
  const base = cwd.replaceAll('\\', '/').replace(/\/+$/, '')
  // Windows paths ignore case; a wrong-case prefix still names the same folder.
  const isInside = slashed.toLowerCase().startsWith(`${base.toLowerCase()}/`)
  return base && isInside ? slashed.slice(base.length + 1) : slashed
}

export interface ReviewComment {
  id: string
  fileKey: string
  /** `src/foo.ts:42-45`, as it goes into the message */
  reference: string
  range: LineRange
  text: string
}

/**
 * The comments as one message: a line each, grouped by file in the order of `fileOrder`, top to
 * bottom within a file. A comment's own line breaks would split it, so they become spaces.
 */
export const messageOfComments = (comments: ReviewComment[], fileOrder: string[]): string => {
  const rank = (key: string) => {
    const at = fileOrder.indexOf(key)
    return at === -1 ? fileOrder.length : at
  }
  return [...comments]
    .sort((a, b) => rank(a.fileKey) - rank(b.fileKey) || a.range.start - b.range.start)
    .map((comment) => `\`${comment.reference}\` — ${comment.text.trim().replace(/\s*\n\s*/g, ' ')}`)
    .join('\n')
}

/** Where the review's lines come from and why, so the header can say so. */
export const reviewSourceList = [
  'git',
  'binary',
  'loading',
  'no_repo',
  'unchanged',
  'ignored',
  'failed'
] as const
export type ReviewSource = (typeof reviewSourceList)[number]

export interface Review {
  source: ReviewSource
  /** Git's view of the file; `null` when the lines come from the chat */
  status: FileStatus | null
  hunks: ReviewHunk[]
  isTruncated: boolean
}

/** Git's answer when it has one worth showing, else the chat's own edits. */
export const reviewOf = (
  answer: { diff: FileDiffProps | null } | undefined,
  isError: boolean,
  chatHunks: ReviewHunk[]
): Review => {
  const fromChat = (source: ReviewSource): Review => ({
    source,
    status: null,
    hunks: chatHunks,
    isTruncated: false
  })
  if (isError) return fromChat('failed')
  if (!answer) return fromChat('loading')
  const { diff } = answer
  if (!diff) return fromChat('no_repo')
  if (diff.is_binary)
    return { source: 'binary', status: diff.status, hunks: [], isTruncated: false }
  switch (diff.status) {
    case 'unchanged':
      return fromChat('unchanged')
    case 'ignored':
      return fromChat('ignored')
    case 'modified':
    case 'added':
    case 'untracked':
    case 'deleted':
      return {
        source: 'git',
        status: diff.status,
        hunks: diff.hunks,
        isTruncated: diff.is_truncated
      }
    default: {
      const unhandled: never = diff.status
      throw new Error(`Unhandled file status: ${unhandled}`)
    }
  }
}
