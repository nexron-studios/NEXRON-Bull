import { describe, expect, it } from 'vitest'
import type { FileDiff } from '@/types/agentd.type'
import {
  commentedIndicesOf,
  displayPathOf,
  foldRows,
  lineSpanOf,
  messageOfComments,
  referenceOf,
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

  it('should keep a commented line out of the fold', () => {
    const rows = foldRows(rowsOf([hunk]), new Set(), new Set([2]))

    expect(rows.slice(0, 2)).toMatchObject([
      { kind: 'line', index: 0 },
      { kind: 'line', index: 1 }
    ])
    expect(rows.some((row) => row.kind === 'line' && row.index === 2)).toBe(true)
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

describe('commentedIndicesOf', () => {
  it('should list every line of every comment', () => {
    const comment = (start: number, end: number): ReviewComment => ({
      id: `${start}`,
      fileKey: 'a',
      reference: 'a:1',
      range: { start, end },
      text: 'x'
    })

    expect([...commentedIndicesOf([comment(2, 4), comment(9, 9)])]).toEqual([2, 3, 4, 9])
  })
})

describe('displayPathOf', () => {
  it('should show a file inside the chat folder relative to it, whatever the case', () => {
    expect(displayPathOf('C:\\Repo\\src\\foo.ts', 'c:\\repo')).toBe('src/foo.ts')
  })

  it('should tell a POSIX folder from one that differs only in case', () => {
    expect(displayPathOf('/home/x/Repo/a.ts', '/home/x/repo')).toBe('/home/x/Repo/a.ts')
  })

  it('should keep the full path of a file outside the folder', () => {
    expect(displayPathOf('/home/x/other.ts', '/home/x/repo')).toBe('/home/x/other.ts')
  })
})

describe('reviewOf', () => {
  const chat = [{ old_start: 1, new_start: 1, lines: [{ sign: '+' as const, text: 'chat' }] }]
  const reply = (answer: FileDiff) => ({ answer })

  it('should take git for a changed file', () => {
    const answer = reply({
      state: 'diff',
      status: 'deleted',
      hunks: [{ old_start: 1, new_start: 0, lines: ['-git'] }],
      is_truncated: false
    })

    expect(reviewOf(answer, false, () => chat)).toEqual({
      kind: 'git',
      status: 'deleted',
      hunks: [{ old_start: 1, new_start: 0, lines: [{ sign: '-', text: 'git' }] }],
      isTruncated: false
    })
  })

  it('should wait while agentd has not answered', () => {
    expect(reviewOf(undefined, false, () => chat)).toEqual({ kind: 'loading' })
  })

  it('should show no lines for a binary file', () => {
    expect(reviewOf(reply({ state: 'binary', status: 'modified' }), false, () => chat)).toEqual({
      kind: 'binary',
      status: 'modified'
    })
  })

  it.each([
    [reply({ state: 'not_in_repository' }), 'no_repo'],
    [reply({ state: 'git_missing' }), 'no_git'],
    [reply({ state: 'clean', status: 'unchanged' }), 'unchanged'],
    [reply({ state: 'clean', status: 'missing' }), 'missing'],
    [reply({ state: 'too_big', status: 'modified' }), 'too_big'],
    [reply({ state: 'failed', message: 'x' }), 'failed']
  ] as const)('should take the chat and say why for %j', (answer, reason) => {
    expect(reviewOf(answer, false, () => chat)).toEqual({ kind: 'chat', reason, hunks: chat })
  })

  it('should take the chat when the request failed', () => {
    expect(reviewOf(undefined, true, () => chat)).toEqual({
      kind: 'chat',
      reason: 'failed',
      hunks: chat
    })
  })

  it('should not read the chat while git answers', () => {
    const answer = reply({ state: 'binary', status: 'added' })

    expect(
      reviewOf(answer, false, () => {
        throw new Error('read the chat')
      })
    ).toEqual({ kind: 'binary', status: 'added' })
  })
})

describe('referenceOf', () => {
  const lines = onlyLines([{ old_start: 40, new_start: 42, lines: [' a', '-b', '+c'] }])

  it('should name the file and the lines of the new file', () => {
    expect(referenceOf(lines, { start: 0, end: 2 }, 'src/a.ts')).toEqual({
      reference: 'src/a.ts:42-43',
      isOld: false
    })
  })

  it('should mark a reference to removed lines only', () => {
    expect(referenceOf(lines, { start: 1, end: 1 }, 'src/a.ts')).toEqual({
      reference: 'src/a.ts:41',
      isOld: true
    })
  })
})
