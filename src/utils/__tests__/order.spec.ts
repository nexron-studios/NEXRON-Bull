import { describe, expect, it } from 'vitest'
import { applyManualOrder, moveItem, withGroupOrder } from '../order'

const rows = (...keys: string[]) => keys.map((key) => ({ key }))
const keysOf = (list: { key: string }[]) => list.map((row) => row.key)

describe('moveItem', () => {
  it('should move one item and keep the rest in order', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('should leave the list as it is for a move past either end', () => {
    expect([moveItem(['a', 'b'], 0, -1), moveItem(['a', 'b'], 1, 2)]).toEqual([
      ['a', 'b'],
      ['a', 'b']
    ])
  })
})

describe('applyManualOrder', () => {
  it('should put placed rows in the stored order after the new ones', () => {
    expect(keysOf(applyManualOrder(rows('a', 'new', 'b', 'c'), ['c', 'a', 'b']))).toEqual([
      'new',
      'c',
      'a',
      'b'
    ])
  })

  it('should keep the automatic order when nothing is stored', () => {
    expect(keysOf(applyManualOrder(rows('b', 'a'), []))).toEqual(['b', 'a'])
  })
})

describe('withGroupOrder', () => {
  it('should store the arranged group first and drop keys that no longer exist', () => {
    const existing = new Set(['a', 'b', 'x', 'y'])
    expect(withGroupOrder(['x', 'gone', 'a', 'y', 'b'], ['b', 'a'], existing)).toEqual([
      'b',
      'a',
      'x',
      'y'
    ])
  })
})
