import { describe, expect, it } from 'vitest'
import { flatIndexOf, sliceGroups } from '../renderBatch'

const groups = [
  { group: 'needs', rows: [] as string[] },
  { group: 'running', rows: ['r1', 'r2'] },
  { group: 'done', rows: ['d1', 'd2', 'd3', 'd4'] },
  { group: 'earlier', rows: ['e1'] }
]

describe('sliceGroups', () => {
  it('should cut the rows across groups at the limit and drop groups left without rows', () => {
    const shown = sliceGroups(groups, 4)
    expect(shown.map(({ group, rows }) => [group, rows])).toEqual([
      ['needs', []],
      ['running', ['r1', 'r2']],
      ['done', ['d1', 'd2']]
    ])
  })

  it('should keep every row of a cut group in allRows', () => {
    expect(sliceGroups(groups, 4)[2].allRows).toEqual(['d1', 'd2', 'd3', 'd4'])
  })

  it('should give each group the position of its first row in the whole list', () => {
    expect(sliceGroups(groups, 7).map(({ start }) => start)).toEqual([0, 0, 2, 6])
  })

  it('should show everything once the limit reaches the total', () => {
    expect(sliceGroups(groups, 7).map(({ rows }) => rows.length)).toEqual([0, 2, 4, 1])
  })
})

describe('sliceGroups with an empty group below a cut one', () => {
  it('should hold back the empty group until every row above it is shown', () => {
    const cut = [
      { group: 'needs', rows: ['n1', 'n2', 'n3'] },
      { group: 'running', rows: [] as string[] }
    ]
    expect([sliceGroups(cut, 2).length, sliceGroups(cut, 3).length]).toEqual([1, 2])
  })
})

describe('flatIndexOf', () => {
  it('should count rows across groups in display order', () => {
    expect(flatIndexOf(groups, (row) => row === 'd2')).toBe(3)
  })

  it('should return -1 when no row matches', () => {
    expect(flatIndexOf(groups, (row) => row === 'x')).toBe(-1)
  })
})
