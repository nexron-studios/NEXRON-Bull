import { describe, expect, it } from 'vitest'
import {
  arrowHead,
  anchorOf,
  circledNumberOf,
  commitStrokes,
  distanceToSegment,
  emptyHistory,
  eraserRadiusOf,
  fitSize,
  markNumbersOf,
  markupNotesOf,
  noteTextOf,
  settledNotesOf,
  redoHistory,
  stepZoom,
  strokeWidthOf,
  toImagePoint,
  undoHistory,
  withoutMark,
  type LineStroke,
  type Stroke
} from '../markup'

const pen = (points: [number, number][], width = 2): LineStroke => ({
  id: 'pen',
  tool: 'pen',
  color: '#f00',
  badge: 10,
  anchor: { x: points[0]?.[0] ?? 0, y: points[0]?.[1] ?? 0 },
  width,
  points: points.map(([x, y]) => ({ x, y }))
})

describe('markup history', () => {
  it('should keep the previous state and drop the redo branch on commit', () => {
    const first = [pen([[0, 0]])]
    const second = [...first, pen([[5, 5]])]
    const undone = undoHistory(commitStrokes(commitStrokes(emptyHistory(), first), second))

    expect(commitStrokes(undone, [])).toEqual({ past: [[], first], present: [], future: [] })
  })

  it('should step back and forth between states with undo and redo', () => {
    const first = [pen([[0, 0]])]
    const history = commitStrokes(emptyHistory(), first)

    expect(undoHistory(history)).toEqual({ past: [], present: [], future: [first] })
    expect(redoHistory(undoHistory(history))).toEqual({ past: [[]], present: first, future: [] })
  })

  it('should leave the history as it is when there is nothing to undo or redo', () => {
    const history = emptyHistory()

    expect(undoHistory(history)).toBe(history)
    expect(redoHistory(history)).toBe(history)
  })
})

describe('strokeWidthOf', () => {
  it('should convert the chosen screen width into image pixels', () => {
    expect(strokeWidthOf('pen', 'm', 0.5)).toBe(8)
  })

  it('should make the highlighter four times as wide', () => {
    expect(strokeWidthOf('highlighter', 's', 1)).toBe(8)
  })
})

describe('toImagePoint', () => {
  it('should map client coordinates onto the natural image size', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 }

    expect(toImagePoint({ x: 150, y: 100 }, rect, { width: 800, height: 400 })).toEqual({
      x: 200,
      y: 200
    })
  })
})

describe('distanceToSegment', () => {
  it('should measure to the nearest point on the segment', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
  })

  it('should measure to the end point beyond the segment', () => {
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5)
  })

  it('should measure to the point when the segment has no length', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
  })
})

describe('eraserRadiusOf', () => {
  it('should make the eraser six line widths wide, in image pixels', () => {
    expect(eraserRadiusOf('m', 0.5)).toBe(24)
  })
})

describe('arrowHead', () => {
  it('should place both sides behind the tip at 30 degrees', () => {
    const [left, right] = arrowHead({ x: 0, y: 0 }, { x: 10, y: 0 }, 2)

    expect(left.x).toBeCloseTo(8.268)
    expect(left.y).toBeCloseTo(-1)
    expect(right.x).toBeCloseTo(8.268)
    expect(right.y).toBeCloseTo(1)
  })
})

describe('fitSize', () => {
  it('should shrink the image into the box keeping its ratio', () => {
    expect(fitSize({ width: 1600, height: 900 }, { width: 800, height: 800 })).toEqual({
      width: 800,
      height: 450
    })
  })

  it('should never scale a small image up', () => {
    expect(fitSize({ width: 200, height: 100 }, { width: 800, height: 800 })).toEqual({
      width: 200,
      height: 100
    })
  })

  it('should return nothing for an image without size', () => {
    expect(fitSize({ width: 0, height: 0 }, { width: 800, height: 800 })).toEqual({
      width: 0,
      height: 0
    })
  })
})

describe('stepZoom', () => {
  it('should go to the next step up or down', () => {
    expect(stepZoom(1, 1)).toBe(1.5)
    expect(stepZoom(1, -1)).toBe(0.75)
  })

  it('should stop at the ends', () => {
    expect(stepZoom(4, 1)).toBe(4)
    expect(stepZoom(0.5, -1)).toBe(0.5)
  })
})

describe('numbered marks', () => {
  const mark = (id: string, tool: 'pen' | 'rect' = 'pen'): Stroke => ({
    ...pen([[1, 2]]),
    id,
    tool
  })
  const pin = (id: string): Stroke => ({
    id,
    tool: 'pin',
    color: '#f00',
    badge: 10,
    anchor: { x: 0, y: 0 },
    points: [{ x: 0, y: 0 }]
  })
  const text: Stroke = {
    id: 'text',
    tool: 'text',
    color: '#f00',
    badge: 10,
    anchor: { x: 0, y: 0 },
    size: 18,
    textWidth: 20,
    text: 'hi',
    points: [{ x: 0, y: 0 }]
  }

  it('should number pins and marks with a note, in the order they were made', () => {
    const strokes = [mark('a'), pin('p'), mark('b'), mark('c')]

    expect([...markNumbersOf(strokes, { c: 'zu klein', a: 'weg' })]).toEqual([
      ['a', 1],
      ['p', 2],
      ['c', 3]
    ])
  })

  it('should keep a number while its note is being edited empty', () => {
    expect([...markNumbersOf([mark('a')], { a: '' })]).toEqual([['a', 1]])
  })

  it('should number a mark cut in pieces once', () => {
    expect([...markNumbersOf([mark('a'), mark('a')], { a: 'x' })]).toEqual([['a', 1]])
  })

  it('should remove every piece of a mark and number the rest anew', () => {
    const strokes = withoutMark([pin('p1'), mark('a'), mark('a'), pin('p2')], 'a')

    expect(strokes.map((stroke) => stroke.id)).toEqual(['p1', 'p2'])
    expect([...markNumbersOf(withoutMark(strokes, 'p1'), {})]).toEqual([['p2', 1]])
  })

  it('should go on after the numbers burnt into the image by an earlier round', () => {
    expect([...markNumbersOf([pin('p'), mark('a')], { a: 'x' }, 1)]).toEqual([
      ['p', 2],
      ['a', 3]
    ])
    expect(markupNotesOf([pin('p')], { p: 'bluer' }, 1)).toEqual([{ number: 2, text: 'bluer' }])
  })

  it('should never number a text', () => {
    expect(markNumbersOf([text], { text: 'x' }).size).toBe(0)
  })

  it('should forget the note of a mark that is gone', () => {
    expect(markupNotesOf([mark('a')], { a: 'bleibt', gone: 'weg' })).toEqual([
      { number: 1, text: 'bleibt' }
    ])
  })

  it('should put each note behind its number, on one line each', () => {
    const strokes = [mark('a'), pin('p'), mark('b')]

    expect(markupNotesOf(strokes, { a: 'zu weit\nlinks', b: 'Scrollleiste weg' })).toEqual([
      { number: 1, text: 'zu weit links' },
      { number: 3, text: 'Scrollleiste weg' }
    ])
  })

  it('should write a note behind its circled number', () => {
    expect([
      noteTextOf({ number: 2, text: 'bluer' }),
      noteTextOf({ number: 21, text: 'far' })
    ]).toEqual(['② bluer', '(21) far'])
  })

  it('should keep edited notes on one line and drop the emptied ones', () => {
    expect(
      settledNotesOf([
        { number: 1, text: ' much\nbigger ' },
        { number: 2, text: '  ' }
      ])
    ).toEqual([{ number: 1, text: 'much bigger' }])
  })

  it('should leave a pin without a note out', () => {
    expect(markupNotesOf([pin('p')], {})).toEqual([])
  })

  it('should anchor a frame at its top-left corner whichever way it was drawn', () => {
    expect(
      anchorOf('rect', [
        { x: 40, y: 60 },
        { x: 10, y: 20 }
      ])
    ).toEqual({ x: 10, y: 20 })
  })

  it('should anchor an arrow at its tail', () => {
    expect(
      anchorOf('arrow', [
        { x: 40, y: 60 },
        { x: 10, y: 20 }
      ])
    ).toEqual({ x: 40, y: 60 })
  })

  it('should write ① to ⑳ and bracket the numbers after', () => {
    expect([1, 20, 21].map(circledNumberOf)).toEqual(['①', '⑳', '(21)'])
  })
})
