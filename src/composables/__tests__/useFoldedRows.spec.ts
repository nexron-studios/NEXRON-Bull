import { beforeEach, describe, expect, it } from 'vitest'
import { useFoldedRows } from '../useFoldedRows'

const KEY = 'test.folded'
const SEVEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

describe('useFoldedRows', () => {
  beforeEach(() => localStorage.clear())

  it('should show five rows and count the rest while folded', () => {
    const fold = useFoldedRows(SEVEN, KEY)

    expect([fold.shown.value.length, fold.hiddenCount.value]).toEqual([5, 2])
  })

  it('should show every row once expanded', () => {
    const fold = useFoldedRows(SEVEN, KEY)

    fold.toggle()

    expect(fold.shown.value.length).toBe(7)
  })

  it('should fold again with "Weniger anzeigen"', () => {
    const fold = useFoldedRows(SEVEN, KEY)

    fold.toggle()
    fold.toggle()

    expect(fold.shown.value).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('should keep a list without storage key folded on its own', () => {
    const own = useFoldedRows(SEVEN)
    const other = useFoldedRows(SEVEN)

    own.toggle()

    expect([own.shown.value.length, other.shown.value.length, localStorage.length]).toEqual([
      7, 5, 0
    ])
  })

  it('should show a single hidden row instead of folding it', () => {
    const fold = useFoldedRows(['a', 'b', 'c', 'd', 'e', 'f'], KEY)

    expect([fold.isFoldable.value, fold.shown.value.length]).toEqual([false, 6])
  })
})
