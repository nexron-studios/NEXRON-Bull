import { describe, expect, it } from 'vitest'
import { textPiecesOf } from '../textPieces'

describe('textPiecesOf', () => {
  it('should cut the text into plain runs and highlights in text order', () => {
    expect(
      textPiecesOf('see @a.ts and [Bild 1]', [
        { start: 14, end: 22, kind: 'image' },
        { start: 4, end: 9, kind: 'mention' }
      ])
    ).toEqual([
      { text: 'see ', kind: null },
      { text: '@a.ts', kind: 'mention' },
      { text: ' and ', kind: null },
      { text: '[Bild 1]', kind: 'image' }
    ])
  })

  it('should leave out a highlight overlapping an earlier one', () => {
    expect(
      textPiecesOf('abcdef', [
        { start: 0, end: 4, kind: 'image' },
        { start: 2, end: 6, kind: 'mention' }
      ])
    ).toEqual([
      { text: 'abcd', kind: 'image' },
      { text: 'ef', kind: null }
    ])
  })

  it('should give back the whole text when nothing is highlighted', () => {
    expect(textPiecesOf('plain', [])).toEqual([{ text: 'plain', kind: null }])
  })
})
