import { describe, expect, it } from 'vitest'
import { textPiecesOf } from '../textPieces'

const IMAGE = { kind: 'image', n: 1, name: 'a.png', src: 'data:image/png;base64,AA' } as const

describe('textPiecesOf', () => {
  it('should cut the text into plain runs and highlights in text order', () => {
    expect(
      textPiecesOf('see @a.ts and [Bild 1]', [
        { start: 14, end: 22, ...IMAGE },
        { start: 4, end: 9, kind: 'mention' }
      ])
    ).toEqual([
      { text: 'see ', mark: null },
      { text: '@a.ts', mark: { kind: 'mention' } },
      { text: ' and ', mark: null },
      {
        text: '[Bild 1]',
        mark: { kind: 'image', n: 1, name: 'a.png', src: 'data:image/png;base64,AA' }
      }
    ])
  })

  it('should leave out a highlight overlapping an earlier one', () => {
    expect(
      textPiecesOf('abcdef', [
        { start: 0, end: 4, kind: 'mention' },
        { start: 2, end: 6, kind: 'mention' }
      ])
    ).toEqual([
      { text: 'abcd', mark: { kind: 'mention' } },
      { text: 'ef', mark: null }
    ])
  })

  it('should give back the whole text when nothing is highlighted', () => {
    expect(textPiecesOf('plain', [])).toEqual([{ text: 'plain', mark: null }])
  })
})
