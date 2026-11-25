/**
 * The eraser as a round brush: it cuts strokes where it passes and leaves the rest standing.
 * Marks stay vectors, so the pieces are new strokes, and the image under them is never touched.
 */
import {
  TEXT_OUTLINE_PER_SIZE,
  arrowHead,
  arrowHeadLengthOf,
  distanceToSegment,
  type LineStroke,
  type Point,
  type Stroke,
  type TextStroke
} from '@/utils/markup'

/** Search steps per segment; they narrow it to (2/3)^32 of its length, far below a pixel. */
const SEARCH_STEPS = 32

const pointAlong = (from: Point, to: Point, at: number): Point => ({
  x: from.x + (to.x - from.x) * at,
  y: from.y + (to.y - from.y) * at
})

/** The lines the eye sees of a mark: the path, the frame as a closed line, or shaft and head. */
export const outlinesOf = (stroke: LineStroke): Point[][] => {
  const first = stroke.points[0]
  const last = stroke.points.at(-1)
  if (!first || !last) return []
  if (stroke.tool === 'rect') {
    const corners = [first, { x: last.x, y: first.y }, last, { x: first.x, y: last.y }]
    return [[...corners, first]]
  }
  if (stroke.tool === 'arrow') {
    const [left, right] = arrowHead(first, last, arrowHeadLengthOf(stroke.width))
    return [
      [first, last],
      [left, last, right]
    ]
  }
  return [stroke.points]
}

/**
 * The fraction of `from → to` inside the area `distance <= reach`, or null when it stays outside.
 * The eraser's sweep is convex, so the distance along a straight line is convex and the inside
 * is one interval: find the nearest fraction, then bisect towards both ends for the edges.
 */
const insideOf = (
  from: Point,
  to: Point,
  distance: (point: Point) => number,
  reach: number
): [number, number] | null => {
  const distanceAt = (at: number) => distance(pointAlong(from, to, at))
  // Distance changes at most as fast as the point moves, so a segment whose middle is further
  // than half its length beyond the reach stays outside; this skips the search for most lines.
  const halfLength = Math.hypot(to.x - from.x, to.y - from.y) / 2
  if (distanceAt(0.5) - halfLength > reach) return null
  let [low, high] = [0, 1]
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const third = (high - low) / 3
    if (distanceAt(low + third) < distanceAt(high - third)) high -= third
    else low += third
  }
  const nearest = (low + high) / 2
  if (distanceAt(nearest) > reach) return null
  // Bisects between a fraction outside and one inside and returns the outside end, so a cut
  // end never lies under the eraser.
  const edge = (outside: number, inside: number) => {
    let [out, into] = [outside, inside]
    for (let step = 0; step < SEARCH_STEPS; step++) {
      const middle = (out + into) / 2
      if (distanceAt(middle) <= reach) into = middle
      else out = middle
    }
    return out
  }
  const enter = distanceAt(0) <= reach ? 0 : edge(0, nearest)
  const leave = distanceAt(1) <= reach ? 1 : edge(1, nearest)
  return [enter, leave]
}

/**
 * The pieces of a polyline outside `distance <= reach`, or null when the line is not touched.
 * Long segments are cut at the exact edge instead of losing a whole point.
 */
export const cutPolyline = (
  points: readonly Point[],
  distance: (point: Point) => number,
  reach: number
): Point[][] | null => {
  const [first, ...rest] = points
  if (!first) return null
  if (!rest.length) return distance(first) <= reach ? [] : null
  const pieces: Point[][] = []
  let current: Point[] | null = distance(first) <= reach ? null : [first]
  let isTouched = !current
  let from = first
  for (const to of rest) {
    const inside = insideOf(from, to, distance, reach)
    if (!inside) {
      // A cut can end right at a vertex that still lies outside; the line goes on from there.
      ;(current ??= [from]).push(to)
    } else {
      isTouched = true
      const [enter, leave] = inside
      if (current && enter > 0) current.push(pointAlong(from, to, enter))
      if (current && current.length > 1) pieces.push(current)
      current = leave < 1 ? [pointAlong(from, to, leave), to] : null
    }
    from = to
  }
  if (current && current.length > 1) pieces.push(current)
  return isTouched ? pieces : null
}

/** A written text as its box and the line through its middle, so wiping across it hits too. */
const textLinesOf = (stroke: TextStroke): Point[][] => {
  const [{ x, y }] = stroke.points
  const right = x + stroke.textWidth
  const bottom = y + stroke.size
  const middle = y + stroke.size / 2
  const box = [
    { x, y },
    { x: right, y },
    { x: right, y: bottom },
    { x, y: bottom },
    { x, y }
  ]
  return [
    box,
    [
      { x, y: middle },
      { x: right, y: middle }
    ]
  ]
}

/** A pin or a text is one thing: touched anywhere, it goes as a whole. */
const isTouched = (lines: Point[][], distance: (point: Point) => number, reach: number) =>
  lines.some((line) => cutPolyline(line, distance, reach) !== null)

const eraseLine = (
  stroke: LineStroke,
  distance: (point: Point) => number,
  radius: number
): Stroke[] => {
  // Half the line width on top, so the ink ends at the eraser's edge, not just its centre line.
  const reach = radius + stroke.width / 2
  const outlines = outlinesOf(stroke)
  const cuts = outlines.map((line) => cutPolyline(line, distance, reach))
  if (cuts.every((cut) => cut === null)) return [stroke]
  const tool = stroke.tool === 'highlighter' ? 'highlighter' : 'pen'
  return cuts
    .flatMap((cut, at) => cut ?? [outlines[at] ?? []])
    .map((points) => ({ ...stroke, tool, points }))
}

/**
 * What is left of one mark after the eraser of `radius` swept from `from` to `to`. An untouched
 * mark comes back as it is; a cut arrow or frame becomes pen lines along its outline.
 */
export const eraseStroke = (stroke: Stroke, from: Point, to: Point, radius: number): Stroke[] => {
  const distance = (point: Point) => distanceToSegment(point, from, to)
  if (stroke.tool === 'pin') {
    return isTouched([stroke.points], distance, radius + stroke.badge) ? [] : [stroke]
  }
  if (stroke.tool === 'text') {
    const reach = radius + (stroke.size * TEXT_OUTLINE_PER_SIZE) / 2
    return isTouched(textLinesOf(stroke), distance, reach) ? [] : [stroke]
  }
  return eraseLine(stroke, distance, radius)
}

/** The marks after one stretch of an eraser drag; the same array when nothing was touched. */
export const eraseAlong = (
  strokes: readonly Stroke[],
  from: Point,
  to: Point,
  radius: number
): readonly Stroke[] => {
  const next = strokes.flatMap((stroke) => eraseStroke(stroke, from, to, radius))
  const isSame =
    next.length === strokes.length && next.every((stroke, at) => stroke === strokes[at])
  return isSame ? strokes : next
}
