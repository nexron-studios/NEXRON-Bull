import { describe, expect, it } from 'vitest'
import {
  MAX_SAVED_IMAGE_NAMES,
  parseSavedImageNames,
  savedImageNameKeyOf,
  tabImageNameKeyOf,
  withSavedImageNames
} from '../imageNames'

describe('savedImageNameKeyOf', () => {
  it('should key by machine, session and a hash of the prompt', () => {
    expect(savedImageNameKeyOf('nexron-server', 'session-a', ['Fix the header'], 1)).toBe(
      'nexron-server|session-a|wbpbn9'
    )
  })

  it('should use an empty machine for this computer', () => {
    expect(savedImageNameKeyOf(null, 'session-a', ['Fix the header'], 1)).toBe('|session-a|wbpbn9')
  })

  it('should tell the same text with another image count apart', () => {
    expect(savedImageNameKeyOf(null, 'session-a', ['Fix the header'], 2)).toBe('|session-a|75cs2')
  })

  it('should tell two prompts apart that differ only by an emoji', () => {
    expect(savedImageNameKeyOf(null, 'session-a', ['Fix 😀'], 1)).not.toBe(
      savedImageNameKeyOf(null, 'session-a', ['Fix 😁'], 1)
    )
  })

  it('should ignore the whitespace Claude trims from the echo', () => {
    expect(savedImageNameKeyOf(null, 'session-a', ['  Fix the header '], 1)).toBe(
      '|session-a|wbpbn9'
    )
  })
})

describe('tabImageNameKeyOf', () => {
  it('should key by tab and the prompt itself', () => {
    expect(tabImageNameKeyOf('tab-1', ['Fix the header'], 1)).toBe('tab-1|1|Fix the header')
  })
})

describe('withSavedImageNames', () => {
  it('should add the names with the time they were saved', () => {
    expect(withSavedImageNames({}, 'k', ['a.png'], 5)).toEqual({ k: { names: ['a.png'], at: 5 } })
  })

  it('should drop the oldest entries beyond the cap', () => {
    const full = Object.fromEntries(
      Array.from({ length: MAX_SAVED_IMAGE_NAMES }, (_, at) => [`k${at}`, { names: ['x.png'], at }])
    )

    const next = withSavedImageNames(full, 'new', ['y.png'], MAX_SAVED_IMAGE_NAMES)

    expect(Object.keys(next)).toHaveLength(500)
    expect(next.k0).toBeUndefined()
    expect(next.k1).toEqual({ names: ['x.png'], at: 1 })
    expect(next.new).toEqual({ names: ['y.png'], at: 500 })
  })
})

describe('parseSavedImageNames', () => {
  it('should start empty when nothing was saved yet', () => {
    expect(parseSavedImageNames(null)).toEqual({})
  })

  it('should start empty from a broken value', () => {
    expect(parseSavedImageNames('{not json')).toEqual({})
    expect(parseSavedImageNames('["a.png"]')).toEqual({})
  })

  it('should keep only valid entries', () => {
    const raw = JSON.stringify({
      good: { names: ['a.png'], at: 1 },
      noTime: { names: ['b.png'] },
      badName: { names: [3], at: 2 }
    })

    expect(parseSavedImageNames(raw)).toEqual({ good: { names: ['a.png'], at: 1 } })
  })
})
