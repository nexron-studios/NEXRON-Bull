import { describe, expect, it } from 'vitest'
import { highlightPieces } from '../highlight'

describe('highlightPieces', () => {
  it('should cut the text at the matched ranges, merging overlaps', () => {
    const ranges = [
      [0, 1],
      [1, 2],
      [5, 6]
    ] as const
    expect(highlightPieces('compact', ranges)).toEqual([
      { text: 'com', isHit: true },
      { text: 'pa', isHit: false },
      { text: 'ct', isHit: true }
    ])
  })

  it('should count like Fuse when an emoji comes before the hit', () => {
    expect(highlightPieces('🚀 Deploy', [[3, 8]])).toEqual([
      { text: '🚀 ', isHit: false },
      { text: 'Deploy', isHit: true }
    ])
  })

  it('should give back one plain piece without ranges', () => {
    expect(highlightPieces('init', [])).toEqual([{ text: 'init', isHit: false }])
  })
})
