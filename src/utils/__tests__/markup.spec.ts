import { describe, expect, it } from 'vitest'
import {
  arrowHead,
  commitStrokes,
  distanceToSegment,
  emptyHistory,
  eraserRadiusOf,
  fitSize,
  redoHistory,
  stepZoom,
  strokeWidthOf,
  toImagePoint,
  undoHistory,
  type Stroke
} from '../markup'

const pen = (points: [number, number][], width = 2): Stroke => ({
  tool: 'pen',
  color: '#f00',
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
