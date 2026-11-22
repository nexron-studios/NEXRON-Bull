import { describe, expect, it } from 'vitest'
import type { Point, Stroke } from '../markup'
import { cutPolyline, eraseAlong, eraseStroke, outlinesOf } from '../markupEraser'

const at = (x: number, y: number): Point => ({ x, y })

const pen = (points: [number, number][], width = 2): Stroke => ({
  tool: 'pen',
  color: '#f00',
  width,
  points: points.map(([x, y]) => at(x, y))
})

const shape = (tool: 'arrow' | 'rect', from: [number, number], to: [number, number]): Stroke => ({
  tool,
  color: '#00f',
  width: 2,
  points: [at(...from), at(...to)]
})

/** Rounds every coordinate, so the bisected cut ends compare as literals. */
const rounded = (pieces: Point[][] | null) =>
  pieces?.map((piece) =>
    piece.map(({ x, y }) => ({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }))
  ) ?? null

const strokesRounded = (strokes: readonly Stroke[]) =>
  strokes.map((stroke) => ({ ...stroke, points: rounded([stroke.points])?.[0] }))

const distanceTo = (center: Point) => (point: Point) =>
  Math.hypot(point.x - center.x, point.y - center.y)

describe('cutPolyline', () => {
  it('should cut a long segment exactly at the edge of the eraser', () => {
    const line = [at(0, 0), at(100, 0)]

    expect(rounded(cutPolyline(line, distanceTo(at(50, 0)), 10))).toEqual([
      [at(0, 0), at(40, 0)],
      [at(60, 0), at(100, 0)]
    ])
  })

  it('should drop the points under the eraser and keep the rest of the path', () => {
    const line = [at(0, 0), at(10, 0), at(20, 0), at(30, 0), at(40, 0)]

    expect(rounded(cutPolyline(line, distanceTo(at(20, 0)), 5))).toEqual([
      [at(0, 0), at(10, 0), at(15, 0)],
      [at(25, 0), at(30, 0), at(40, 0)]
    ])
  })

  it('should shorten a line whose start lies under the eraser', () => {
    const line = [at(0, 0), at(100, 0)]

    expect(rounded(cutPolyline(line, distanceTo(at(0, 0)), 10))).toEqual([[at(10, 0), at(100, 0)]])
  })

  it('should return nothing when the eraser covers the whole line', () => {
    expect(cutPolyline([at(0, 0), at(4, 0)], distanceTo(at(2, 0)), 10)).toEqual([])
  })

  it('should return null when the eraser does not touch the line', () => {
    expect(cutPolyline([at(0, 0), at(100, 0)], distanceTo(at(50, 20)), 10)).toBeNull()
  })

  it('should keep the rest of the path when a cut ends just short of a vertex', () => {
    // Both edges lie 1e-9 inside the vertices, closer than the search can resolve.
    const line = [at(0, 0), at(100, 0), at(200, 0)]

    expect(cutPolyline(line, distanceTo(at(50, 0)), 50 - 1e-9)).toEqual([[at(100, 0), at(200, 0)]])
  })

  it('should erase a single dot under the eraser and leave one beside it', () => {
    expect(cutPolyline([at(0, 0)], distanceTo(at(1, 0)), 2)).toEqual([])
    expect(cutPolyline([at(0, 0)], distanceTo(at(5, 0)), 2)).toBeNull()
  })
})

describe('outlinesOf', () => {
  it('should trace a frame as one closed line', () => {
    expect(outlinesOf(shape('rect', [0, 0], [10, 5]))).toEqual([
      [at(0, 0), at(10, 0), at(10, 5), at(0, 5), at(0, 0)]
    ])
  })

  it('should trace an arrow as shaft and head', () => {
    const [shaft, head] = outlinesOf(shape('arrow', [0, 0], [100, 0]))

    expect(shaft).toEqual([at(0, 0), at(100, 0)])
    expect(rounded([head ?? []])).toEqual([[at(89.608, -6), at(100, 0), at(89.608, 6)]])
  })
})

describe('eraseStroke', () => {
  it('should split a pen stroke into two strokes where the eraser crossed it', () => {
    const stroke = pen(
      [
        [0, 0],
        [100, 0]
      ],
      4
    )

    expect(strokesRounded(eraseStroke(stroke, at(50, -20), at(50, 20), 8))).toEqual([
      { ...stroke, points: [at(0, 0), at(40, 0)] },
      { ...stroke, points: [at(60, 0), at(100, 0)] }
    ])
  })

  it('should return the very same stroke when the eraser misses it', () => {
    const stroke = pen([
      [0, 0],
      [100, 0]
    ])

    expect(eraseStroke(stroke, at(50, 20), at(60, 20), 5)[0]).toBe(stroke)
  })

  it('should turn a partly erased frame into pen lines along its outline', () => {
    const frame = shape('rect', [0, 0], [100, 50])

    expect(strokesRounded(eraseStroke(frame, at(50, 0), at(50, 0), 9))).toEqual([
      { ...frame, tool: 'pen', points: [at(0, 0), at(40, 0)] },
      { ...frame, tool: 'pen', points: [at(60, 0), at(100, 0), at(100, 50), at(0, 50), at(0, 0)] }
    ])
  })

  it('should leave a frame alone when the eraser wipes its empty middle', () => {
    const frame = shape('rect', [0, 0], [100, 50])

    expect(eraseStroke(frame, at(40, 25), at(60, 25), 2)[0]).toBe(frame)
  })

  it('should keep the untouched head of an arrow when its shaft is cut', () => {
    const arrow = shape('arrow', [0, 0], [100, 0])
    const [before, after, head] = eraseStroke(arrow, at(50, 0), at(50, 0), 9)

    expect(rounded([before?.points ?? [], after?.points ?? []])).toEqual([
      [at(0, 0), at(40, 0)],
      [at(60, 0), at(100, 0)]
    ])
    expect(rounded([head?.points ?? []])).toEqual([[at(89.608, -6), at(100, 0), at(89.608, 6)]])
    expect(head?.tool).toBe('pen')
  })
})

describe('eraseAlong', () => {
  it('should return the same array when the drag touches nothing', () => {
    const strokes = [pen([[0, 0]])]

    expect(eraseAlong(strokes, at(50, 50), at(60, 50), 2)).toBe(strokes)
  })

  it('should remove a dot and keep the strokes the drag missed', () => {
    const dot = pen([[10, 10]])
    const kept = pen([[100, 100]])

    expect(eraseAlong([dot, kept], at(0, 10), at(20, 10), 2)).toEqual([kept])
  })
})
