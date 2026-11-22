import { describe, expect, it } from 'vitest'
import { leftPercentOf, percentOf, percentWidth } from '../percent'

describe('percentOf', () => {
  it('should give the share of the whole and 0 for an empty whole', () => {
    expect(percentOf(22_000, 200_000)).toBe(11)
    expect(percentOf(5, 0)).toBe(0)
  })
})

describe('percentWidth', () => {
  it('should keep a bar within its track', () => {
    expect([percentWidth(42), percentWidth(130), percentWidth(-4)]).toEqual(['42%', '100%', '0%'])
  })
})

describe('leftPercentOf', () => {
  it('should give what is left of a quota and never less than 0', () => {
    expect([leftPercentOf(15), leftPercentOf(100), leftPercentOf(104)]).toEqual([85, 0, 0])
  })
})
