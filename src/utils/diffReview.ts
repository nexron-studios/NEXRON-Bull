import type { FileDiffAnswer, FileDiffProps, FileStatus } from '@/types/agentd.type'
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
 * change, the rest is one fold unless `expanded` holds its id.
 */
export const foldRows = (rows: DiffRow[], expanded: ReadonlySet<number>): ReviewRow[] => {
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
  'no_git',
  'unchanged',
  'ignored',
  'missing',
  'too_big',
  'failed'
] as const
export type ReviewSource = (typeof reviewSourceList)[number]

export interface Review {
  source: ReviewSource
  /** Git's view of the file; `null` when the lines come from the chat */
  status: FileStatus | null
  hunks: DiffHunk[]
  isTruncated: boolean
}

const fromChat = (source: ReviewSource, chatHunks: DiffHunk[]): Review => ({
  source,
  status: null,
  hunks: chatHunks,
  isTruncated: false
})

const reviewOfDiff = (diff: FileDiffProps, chatHunks: DiffHunk[]): Review => {
  if (diff.is_binary)
    return { source: 'binary', status: diff.status, hunks: [], isTruncated: false }
  switch (diff.status) {
    case 'unchanged':
    case 'ignored':
    case 'missing':
      return fromChat(diff.status, chatHunks)
    case 'modified':
    case 'added':
    case 'untracked':
    case 'deleted':
      // Too big for agentd to send any lines: the chat's edits say more than an empty diff.
      if (diff.is_truncated && !diff.hunks.length) return fromChat('too_big', chatHunks)
      return {
        source: 'git',
        status: diff.status,
        hunks: hunksOfPatch(diff.hunks),
        isTruncated: diff.is_truncated
      }
    default: {
      const unhandled: never = diff.status
      throw new Error(`Unhandled file status: ${unhandled}`)
    }
  }
}

/** Git's answer when it has one worth showing, else the chat's own edits. */
export const reviewOf = (
  reply: { answer: FileDiffAnswer } | undefined,
  isError: boolean,
  chatHunks: DiffHunk[]
): Review => {
  if (isError) return fromChat('failed', chatHunks)
  if (!reply) return fromChat('loading', chatHunks)
  const { answer } = reply
  switch (answer.state) {
    case 'diff':
      return reviewOfDiff(answer, chatHunks)
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
