import type { ChangedStatus, FileDiff } from '@/types/agentd.type'
import { fileKeyOf } from '@/utils/changedFiles'
import { hunksOfPatch, type DiffHunk, type DiffLineRow, type DiffRow } from '@/utils/diffRows'

/**
 * The diff review (right panel › changed files): a file's hunks as numbered lines, long unchanged
 * stretches folded, and line comments formatted for the composer.
 */

export type ReviewRow =
  | DiffRow
  /** Unchanged lines hidden until opened; `id` is the index of the first one */
  | { kind: 'fold'; id: number; lines: DiffLineRow[] }

/** Unchanged lines kept visible on each side of a change, as git does */
export const CONTEXT_LINES = 3
/** A shorter stretch is cheaper to show than to open */
export const MIN_FOLDED_LINES = 4

/**
 * Folds every unchanged stretch that is longer than its context: `CONTEXT_LINES` stay next to a
 * change, the rest is one fold unless `expanded` holds its id. A `pinned` line (one a comment
 * names) stays visible like a change, so a pending comment never hides in a fold.
 */
export const foldRows = (
  rows: DiffRow[],
  expanded: ReadonlySet<number>,
  pinned: ReadonlySet<number> = new Set()
): ReviewRow[] => {
  const out: ReviewRow[] = []
  let run: DiffLineRow[] = []
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
    if (row.kind === 'line' && row.sign === ' ' && !pinned.has(row.index)) {
      run.push(row)
      continue
    }
    flush(row.kind === 'line')
    out.push(row)
  }
  flush(false)
  return out
}

/** A line can only be named in a comment when the file has a number for it. */
export const isCommentable = (line: DiffLineRow) => line.new !== null || line.old !== null

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
  lines: DiffLineRow[],
  range: LineRange
): { span: string; isOld: boolean } | null => {
  const chosen = lines.filter((line) => line.index >= range.start && line.index <= range.end)
  const current = chosen.flatMap((line) => (line.new === null ? [] : [line.new]))
  if (current.length) return { span: spanOf(current), isOld: false }
  const old = chosen.flatMap((line) => (line.old === null ? [] : [line.old]))
  return old.length ? { span: spanOf(old), isOld: true } : null
}

/** `src/foo.ts:42-45` for the chosen lines; `isOld` when only removed lines were chosen. */
export const referenceOf = (
  lines: DiffLineRow[],
  range: LineRange,
  path: string
): { reference: string; isOld: boolean } | null => {
  const span = lineSpanOf(lines, range)
  return span ? { reference: `${path}:${span.span}`, isOld: span.isOld } : null
}

/** Where a file sits for the user: relative to the chat's folder, else its full path. */
export const displayPathOf = (path: string, cwd: string): string => {
  const slashed = path.replaceAll('\\', '/')
  const base = cwd.replaceAll('\\', '/').replace(/\/+$/, '')
  // Compared as file keys: a Windows path ignores case, a POSIX one does not.
  const isInside = fileKeyOf(slashed).startsWith(`${fileKeyOf(base)}/`)
  return base && isInside ? slashed.slice(base.length + 1) : slashed
}

/** Every line a comment names, so the diff keeps them out of its folds. */
export const commentedIndicesOf = (comments: ReviewComment[]): Set<number> =>
  new Set(
    comments.flatMap(({ range }) =>
      Array.from({ length: range.end - range.start + 1 }, (_, at) => range.start + at)
    )
  )

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

/** Why the review shows the chat's own edits instead of git's diff */
export const chatReasonList = [
  'no_repo',
  'no_git',
  'unchanged',
  'ignored',
  'missing',
  'too_big',
  'failed'
] as const
export type ChatReason = (typeof chatReasonList)[number]

export type Review =
  | { kind: 'loading' }
  | { kind: 'git'; status: ChangedStatus; hunks: DiffHunk[]; isTruncated: boolean }
  | { kind: 'binary'; status: ChangedStatus }
  | { kind: 'chat'; reason: ChatReason; hunks: DiffHunk[] }

/** The chat's edits, read only when they stand in: a new chat message then changes nothing. */
type ChatHunks = () => DiffHunk[]

const fromChat = (reason: ChatReason, chatHunks: ChatHunks): Review => ({
  kind: 'chat',
  reason,
  hunks: chatHunks()
})

/** Git's answer when it has one worth showing, else the chat's own edits. */
export const reviewOf = (
  reply: { answer: FileDiff } | undefined,
  isError: boolean,
  chatHunks: ChatHunks
): Review => {
  if (isError) return fromChat('failed', chatHunks)
  if (!reply) return { kind: 'loading' }
  const { answer } = reply
  switch (answer.state) {
    case 'diff':
      return {
        kind: 'git',
        status: answer.status,
        hunks: hunksOfPatch(answer.hunks),
        isTruncated: answer.is_truncated
      }
    case 'binary':
      return { kind: 'binary', status: answer.status }
    case 'too_big':
      return fromChat('too_big', chatHunks)
    case 'clean':
      return fromChat(answer.status, chatHunks)
    case 'not_in_repository':
      return fromChat('no_repo', chatHunks)
    case 'git_missing':
      return fromChat('no_git', chatHunks)
    case 'failed':
      return fromChat('failed', chatHunks)
    default: {
      const unhandled: never = answer
      throw new Error(`Unhandled file_diff answer: ${JSON.stringify(unhandled)}`)
    }
  }
}

/** The lines a review shows; none while loading or for a binary file. */
export const hunksOfReview = (review: Review): DiffHunk[] =>
  review.kind === 'git' || review.kind === 'chat' ? review.hunks : []
