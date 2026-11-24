import { describe, expect, it } from 'vitest'
import type { FileDiffProps } from '@/types/agentd.type'
import {
  displayPathOf,
  foldRows,
  lineSpanOf,
  messageOfComments,
  reviewOf,
  type ReviewComment
} from '../diffReview'
import { hunksOfPatch, rowsOfHunks, type DiffLineRow } from '../diffRows'

const context = (count: number, from = 1) =>
  Array.from({ length: count }, (_, at) => ` line ${from + at}`)

const rowsOf = (patch: Parameters<typeof hunksOfPatch>[0]) => rowsOfHunks(hunksOfPatch(patch))
const onlyLines = (patch: Parameters<typeof hunksOfPatch>[0]) =>
  rowsOf(patch).filter((row): row is DiffLineRow => row.kind === 'line')

describe('foldRows', () => {
  const hunk = {
    old_start: 1,
    new_start: 1,
    lines: [...context(10), '-old', '+new', ...context(10, 11)]
  }

  it('should fold long unchanged stretches but keep three lines next to the change', () => {
    const rows = foldRows(rowsOf([hunk]), new Set())

    expect(
      rows.map((row) => (row.kind === 'fold' ? `fold ${row.lines.length}` : row.kind))
    ).toEqual([
      'fold 7',
      ...Array(3).fill('line'),
      'line',
      'line',
      ...Array(3).fill('line'),
      'fold 7'
    ])
  })

  it('should show a fold that was opened', () => {
    const rows = foldRows(rowsOf([hunk]), new Set([0]))

    expect(rows.filter((row) => row.kind === 'fold')).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'line', index: 0 })
  })

  it('should not fold a stretch that is barely longer than its context', () => {
    const short = { old_start: 1, new_start: 1, lines: [...context(5), '+x'] }

    expect(foldRows(rowsOf([short]), new Set()).some((row) => row.kind === 'fold')).toBe(false)
  })
})

describe('lineSpanOf', () => {
  const lines = onlyLines([{ old_start: 40, new_start: 42, lines: [' a', '-b', '+c', '+d'] }])

  it('should name the lines of the new file', () => {
    expect(lineSpanOf(lines, { start: 0, end: 3 })).toEqual({ span: '42-44', isOld: false })
  })

  it('should name the old lines when only removed lines are chosen', () => {
    expect(lineSpanOf(lines, { start: 1, end: 1 })).toEqual({ span: '41', isOld: true })
  })
})

describe('messageOfComments', () => {
  const comment = (
    fileKey: string,
    start: number,
    reference: string,
    text: string
  ): ReviewComment => ({
    id: `${fileKey}${start}`,
    fileKey,
    reference,
    range: { start, end: start },
    text
  })

  it('should write one line per comment, grouped by file in the given order', () => {
    const message = messageOfComments(
      [
        comment('b', 0, 'src/b.ts:3', 'rename'),
        comment('a', 9, 'src/a.ts:50', 'second'),
        comment('a', 2, 'src/a.ts:42-45', 'first\n  with a break')
      ],
      ['a', 'b']
    )

    expect(message).toBe(
      [
        '`src/a.ts:42-45` — first with a break',
        '`src/a.ts:50` — second',
        '`src/b.ts:3` — rename'
      ].join('\n')
    )
  })
})

describe('displayPathOf', () => {
  it('should show a file inside the chat folder relative to it, whatever the case', () => {
    expect(displayPathOf('C:\\Repo\\src\\foo.ts', 'c:\\repo')).toBe('src/foo.ts')
  })

  it('should keep the full path of a file outside the folder', () => {
    expect(displayPathOf('/home/x/other.ts', '/home/x/repo')).toBe('/home/x/other.ts')
  })
})

describe('reviewOf', () => {
  const chat = [{ old_start: 1, new_start: 1, lines: [{ sign: '+' as const, text: 'chat' }] }]
  const diff = (status: FileDiffProps['status'], isBinary = false): { diff: FileDiffProps } => ({
    diff: {
      status,
      hunks: [{ old_start: 1, new_start: 1, lines: ['+git'] }],
      is_binary: isBinary,
      is_truncated: false
    }
  })

  it('should take git for a changed file', () => {
    expect(reviewOf(diff('modified'), false, chat)).toMatchObject({
      source: 'git',
      status: 'modified',
      hunks: [{ old_start: 1, new_start: 1, lines: [{ sign: '+', text: 'git' }] }]
    })
  })

  it('should fall back to the chat outside a repository and for a committed file', () => {
    expect(reviewOf({ diff: null }, false, chat)).toEqual({
      source: 'no_repo',
      status: null,
      hunks: chat,
      isTruncated: false
    })
    expect(reviewOf(diff('unchanged'), false, chat).source).toBe('unchanged')
  })

  it('should keep the git status of a deleted file', () => {
    expect(reviewOf(diff('deleted'), false, chat).status).toBe('deleted')
  })

  it('should fall back to the chat when agentd failed', () => {
    expect(reviewOf(undefined, true, chat).source).toBe('failed')
  })

  it('should show no lines for a binary file', () => {
    expect(reviewOf(diff('modified', true), false, chat)).toEqual({
      source: 'binary',
      status: 'modified',
      hunks: [],
      isTruncated: false
    })
  })
})
