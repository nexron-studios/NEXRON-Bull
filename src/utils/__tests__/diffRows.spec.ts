import { describe, expect, it } from 'vitest'
import {
  countsOf,
  hunksOfChange,
  hunksOfPatch,
  rowsOfHunks,
  shapeOf,
  withoutNumbers
} from '../diffRows'

describe('hunksOfPatch', () => {
  it('should split each line into its mark and its text', () => {
    expect(hunksOfPatch([{ old_start: 3, new_start: 4, lines: [' a', '-b', '+c'] }])).toEqual([
      {
        old_start: 3,
        new_start: 4,
        lines: [
          { sign: ' ', text: 'a' },
          { sign: '-', text: 'b' },
          { sign: '+', text: 'c' }
        ]
      }
    ])
  })
})

describe('hunksOfChange', () => {
  const lines = [{ sign: '+' as const, text: 'a' }]

  it('should number a Write without patch as the whole new file', () => {
    expect(hunksOfChange('Write', lines, undefined)).toEqual([
      { old_start: 0, new_start: 1, lines }
    ])
  })

  it('should leave an Edit without patch unnumbered', () => {
    expect(hunksOfChange('Edit', lines, undefined)).toEqual([
      { old_start: null, new_start: null, lines }
    ])
  })

  it('should prefer the patch Claude Code sent', () => {
    const patch = [{ old_start: 3, new_start: 3, lines: ['-a', '+b'] }]

    expect(hunksOfChange('Edit', [{ sign: '-', text: 'a' }], patch)).toEqual([
      {
        old_start: 3,
        new_start: 3,
        lines: [
          { sign: '-', text: 'a' },
          { sign: '+', text: 'b' }
        ]
      }
    ])
  })
})

describe('rowsOfHunks', () => {
  it('should number removed lines in the old file and added ones in the new file', () => {
    const rows = rowsOfHunks(
      hunksOfPatch([{ old_start: 10, new_start: 12, lines: [' a', '-b', '+c', ' d'] }])
    )

    expect(
      rows.map((row) => (row.kind === 'line' ? [row.sign, row.old, row.new] : row.kind))
    ).toEqual([
      [' ', 10, 12],
      ['-', 11, null],
      ['+', null, 13],
      [' ', 12, 14]
    ])
  })

  it('should put a gap between two hunks and count indices across them', () => {
    const rows = rowsOfHunks(
      hunksOfPatch([
        { old_start: 1, new_start: 1, lines: ['-a'] },
        { old_start: 9, new_start: 8, lines: ['+b'] }
      ])
    )

    expect(rows.map((row) => (row.kind === 'line' ? row.index : 'gap'))).toEqual([0, 'gap', 1])
  })

  it('should leave lines without numbers when the chat recorded none', () => {
    const [row] = rowsOfHunks([
      { old_start: null, new_start: null, lines: [{ sign: '+', text: 'x' }] }
    ])

    expect(row).toEqual({ kind: 'line', index: 0, sign: '+', old: null, new: null, text: 'x' })
  })
})

describe('countsOf', () => {
  it('should count added and removed lines, not context', () => {
    const hunks = hunksOfPatch([{ old_start: 1, new_start: 1, lines: [' a', '-b', '+c', '+d'] }])

    expect(countsOf(hunks)).toEqual({ added: 2, removed: 1 })
  })
})

describe('withoutNumbers', () => {
  it('should drop the starts and keep the lines', () => {
    const lines = [{ sign: '-' as const, text: 'a' }]

    expect(withoutNumbers([{ old_start: 4, new_start: 4, lines }])).toEqual([
      { old_start: null, new_start: null, lines }
    ])
  })
})

describe('shapeOf', () => {
  it('should be equal for the same diff read again and differ once lines move', () => {
    const read = () => hunksOfPatch([{ old_start: 3, new_start: 3, lines: ['-a', '+b'] }])

    expect(shapeOf(read())).toBe(shapeOf(read()))
    expect(shapeOf(read())).not.toBe(
      shapeOf(hunksOfPatch([{ old_start: 3, new_start: 3, lines: ['-a', '+b', '+c'] }]))
    )
  })
})
