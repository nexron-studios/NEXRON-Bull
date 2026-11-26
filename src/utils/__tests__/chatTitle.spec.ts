import { describe, expect, it } from 'vitest'
import { plainTitleOf, titlePiecesOf } from '../chatTitle'
import { IMAGE_REF_SLOTS, imageRefFormatOf } from '../imageRefs'

const FORMAT = imageRefFormatOf(`[Bild ${IMAGE_REF_SLOTS.n} (${IMAGE_REF_SLOTS.name})]`)

describe('titlePiecesOf', () => {
  it('should turn an image reference into its number between the text around it', () => {
    expect(titlePiecesOf('wa [Bild 1 (Bild 22-00-35.png)] mir brutal', FORMAT)).toEqual([
      { kind: 'text', text: 'wa ' },
      { kind: 'image', n: 1 },
      { kind: 'text', text: ' mir brutal' }
    ])
  })

  it('should read a reference cut off at the end as that image', () => {
    expect(titlePiecesOf('[Bild 1 (a.png)] und [Bild 2 (Bild 22-0', FORMAT)).toEqual([
      { kind: 'image', n: 1 },
      { kind: 'text', text: ' und ' },
      { kind: 'image', n: 2 }
    ])
  })

  it('should take only the last unclosed bracket as the cut reference', () => {
    expect(titlePiecesOf('Siehe [Bild 1 oben und [Bild 2 (Screenshot 20', FORMAT)).toEqual([
      { kind: 'text', text: 'Siehe [Bild 1 oben und ' },
      { kind: 'image', n: 2 }
    ])
  })

  it('should keep a title that merely ends in a number after the head as text', () => {
    expect(titlePiecesOf('Layout von [Bild 3', FORMAT)).toEqual([
      { kind: 'text', text: 'Layout von [Bild 3' }
    ])
  })

  it('should not read image 0 as a cut reference', () => {
    expect(titlePiecesOf('Fix [Bild 0 (x', FORMAT)).toEqual([
      { kind: 'text', text: 'Fix [Bild 0 (x' }
    ])
  })

  it('should find no cut reference when the template starts with the number', () => {
    const numberFirst = imageRefFormatOf(`${IMAGE_REF_SLOTS.n}. Bild (${IMAGE_REF_SLOTS.name})`)

    expect(titlePiecesOf('Schritt 2. Bild (a', numberFirst)).toEqual([
      { kind: 'text', text: 'Schritt 2. Bild (a' }
    ])
  })

  it('should keep a title without references as one text', () => {
    expect(titlePiecesOf('Login-Bug [beheben]', FORMAT)).toEqual([
      { kind: 'text', text: 'Login-Bug [beheben]' }
    ])
  })
})

describe('plainTitleOf', () => {
  it('should put the short label in place of each reference', () => {
    expect(plainTitleOf('[Bild 2 (shot.png)] passt so', FORMAT, (n) => `Bild ${n}`)).toBe(
      'Bild 2 passt so'
    )
  })
})
