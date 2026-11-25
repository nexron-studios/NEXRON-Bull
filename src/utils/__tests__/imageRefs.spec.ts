import { describe, expect, it } from 'vitest'
import {
  IMAGE_REF_SLOTS,
  imageRefAt,
  insertAfter,
  imageRefFormatOf,
  imageRefNumberAt,
  imageRefsOf,
  insertImageRefs,
  remapImageRefs,
  sentImageRefHighlightsOf,
  validImageRefsOf,
  withPlainImageRefs
} from '../imageRefs'

const FORMAT = imageRefFormatOf(`[Bild ${IMAGE_REF_SLOTS.n} (${IMAGE_REF_SLOTS.name})]`)

const shot = { id: 'a', name: 'Bild 15-01-01.png' }
const logo = { id: 'b', name: 'logo.png' }
const third = { id: 'c', name: 'Bild 12-03-04 (2).png' }

/** As the composer renders a reference: no line break inside, so no-break spaces and hyphens. */
const unbroken = (text: string) =>
  text.replace(/\[[^\]]*\]/g, (token) => token.replaceAll(' ', '\u00a0').replaceAll('-', '\u2011'))

describe('imageRefFormatOf', () => {
  it('should render number and a shortened name into the template', () => {
    expect(FORMAT.render(2, 'a very long screenshot name of a window.png')).toBe(
      '[Bild\u00a02\u00a0(a\u00a0very\u00a0long\u00a0screenshot\u00a0n…)]'
    )
  })

  it('should turn brackets in a name into round ones so the reference stays one token', () => {
    expect(FORMAT.render(1, 'shot [1].png')).toBe(unbroken('[Bild 1 (shot (1).png)]'))
  })

  it('should fill and find a slot the template uses twice', () => {
    const twice = imageRefFormatOf(
      `[${IMAGE_REF_SLOTS.n}: Bild ${IMAGE_REF_SLOTS.n} (${IMAGE_REF_SLOTS.name})]`
    )
    expect(twice.render(2, 'a.png')).toBe(unbroken('[2: Bild 2 (a.png)]'))
    expect(imageRefsOf('x [2: Bild 2 (a.png)]', twice)).toEqual([
      { start: 2, end: 21, n: 2, name: 'a.png' }
    ])
  })

  it('should keep dollar signs in a name as they are', () => {
    expect(FORMAT.render(1, '$&.png')).toBe(unbroken('[Bild 1 ($&.png)]'))
  })
})

describe('imageRefsOf', () => {
  it('should find each reference with its number and name, also names with parentheses', () => {
    expect(imageRefsOf('x [Bild 3 (Bild 12-03-04 (2).png)] y [Bild 1 (a.png)]', FORMAT)).toEqual([
      { start: 2, end: 34, n: 3, name: 'Bild 12-03-04 (2).png' },
      { start: 37, end: 53, n: 1, name: 'a.png' }
    ])
  })

  it('should not run a broken reference into the next one', () => {
    expect(imageRefsOf('[Bild 1 (a.png [Bild 2 (b.png)]', FORMAT)).toEqual([
      { start: 15, end: 31, n: 2, name: 'b.png' }
    ])
  })
})

describe('validImageRefsOf', () => {
  it('should keep only references whose number and name fit the attachments', () => {
    const text = '[Bild 1 (Bild 15-01-01.png)] [Bild 2 (other.png)] [Bild 3 (logo.png)]'
    expect(validImageRefsOf(text, [shot, logo], FORMAT).map((ref) => ref.image.id)).toEqual(['a'])
  })

  it('should recognise a reference typed with plain spaces and hyphens', () => {
    const text = '[Bild 1 (Bild 15-01-01.png)]'
    expect(validImageRefsOf(text, [shot], FORMAT).map((ref) => ref.image.id)).toEqual(['a'])
  })

  it('should recognise a rendered reference to a name with parentheses', () => {
    const text = FORMAT.render(1, third.name)
    expect(validImageRefsOf(text, [third], FORMAT).map((ref) => ref.image.id)).toEqual(['c'])
  })
})

describe('remapImageRefs', () => {
  const text = 'look at [Bild 1 (Bild 15-01-01.png)] and [Bild 2 (logo.png)] here'

  it('should renumber references when the images change places', () => {
    expect(remapImageRefs(text, [shot, logo], [logo, shot], FORMAT)).toBe(
      unbroken('look at [Bild 2 (Bild 15-01-01.png)] and [Bild 1 (logo.png)] here')
    )
  })

  it('should drop the reference of a removed image with one space and renumber the rest', () => {
    expect(remapImageRefs(text, [shot, logo], [logo], FORMAT)).toBe(
      unbroken('look at and [Bild 1 (logo.png)] here')
    )
  })

  it('should drop a reference at the end of a line without leaving a space behind', () => {
    expect(remapImageRefs('see [Bild 1 (logo.png)]\nnext', [logo], [], FORMAT)).toBe('see\nnext')
  })

  it('should point a replaced image at its successor under the new name', () => {
    const marked = { id: 'm', name: 'Bild 15-01-01.png' }
    expect(remapImageRefs(text, [shot, logo], [marked, shot, logo], FORMAT, { a: 'm' })).toBe(
      unbroken('look at [Bild 1 (Bild 15-01-01.png)] and [Bild 3 (logo.png)] here')
    )
  })

  it('should leave references alone that name no attachment', () => {
    const stale = 'old [Bild 1 (gone.png)] text'
    expect(remapImageRefs(stale, [shot], [], FORMAT)).toBe(stale)
  })
})

describe('insertImageRefs', () => {
  it('should put references in place of the selection with spaces where needed', () => {
    expect(insertImageRefs('see this', { start: 3, end: 3 }, ['[A]', '[B]'])).toEqual({
      text: 'see [A] [B] this',
      caret: 11
    })
  })

  it('should append to the end with a space after for typing on', () => {
    expect(insertImageRefs('see', { start: 3, end: 3 }, ['[A]'])).toEqual({
      text: 'see [A] ',
      caret: 8
    })
  })

  it('should replace selected text like a paste', () => {
    expect(insertImageRefs('see that here', { start: 4, end: 8 }, ['[A]'])).toEqual({
      text: 'see [A] here',
      caret: 7
    })
  })
})

describe('imageRefAt', () => {
  const refs = imageRefsOf('a [Bild 1 (x.png)] b', FORMAT)

  it('should find the reference Backspace would cut into, also right after it', () => {
    expect(imageRefAt(refs, 18, 'backward')?.start).toBe(2)
    expect(imageRefAt(refs, 2, 'backward')).toBeNull()
  })

  it('should find the reference Delete would cut into, also right before it', () => {
    expect(imageRefAt(refs, 2, 'forward')?.end).toBe(18)
    expect(imageRefAt(refs, 18, 'forward')).toBeNull()
  })
})

describe('sentImageRefHighlightsOf', () => {
  it('should highlight only references with an image of the prompt behind them', () => {
    expect(
      sentImageRefHighlightsOf('[Bild 1 (a)] [Bild 3 (c)]', ['data:1', 'data:2'], FORMAT)
    ).toEqual([{ start: 0, end: 12, kind: 'image', n: 1, name: 'a', src: 'data:1' }])
  })
})

describe('withPlainImageRefs', () => {
  it('should give references plain spaces and hyphens back and leave other text alone', () => {
    const text = `see ${FORMAT.render(1, shot.name)}\u00a0now`
    expect(withPlainImageRefs(text, FORMAT)).toBe('see [Bild 1 (Bild 15-01-01.png)]\u00a0now')
  })
})

describe('imageRefNumberAt', () => {
  const boxes = [
    { n: 1, rect: { left: 10, right: 110, top: 0, bottom: 20 } },
    { n: 2, rect: { left: 40, right: 140, top: 24, bottom: 44 } }
  ]

  it('should give the number of the chip under the point', () => {
    expect(imageRefNumberAt(boxes, 60, 30)).toBe(2)
  })

  it('should count a point on the edge as inside', () => {
    expect(imageRefNumberAt(boxes, 110, 20)).toBe(1)
  })

  it('should give null beside every chip', () => {
    expect(imageRefNumberAt(boxes, 120, 10)).toBeNull()
  })
})

describe('insertAfter', () => {
  it('should set the addition apart by a space on either side inside a text', () => {
    expect(insertAfter('see [ref] here', 9, '① bigger')).toBe('see [ref] ① bigger here')
  })

  it('should add no space at the end or before whitespace', () => {
    expect([insertAfter('[ref]', 5, '① a'), insertAfter('[ref]\nnext', 5, '① a')]).toEqual([
      '[ref] ① a',
      '[ref] ① a\nnext'
    ])
  })
})
