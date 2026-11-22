import {
  HIGHLIGHTER_ALPHA,
  arrowHead,
  arrowHeadLengthOf,
  type Point,
  type Stroke
} from '@/utils/markup'

type Context = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'strokeRect'
  | 'save'
  | 'restore'
  | 'globalAlpha'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
>

const tracePath = (ctx: Context, [first, ...rest]: readonly Point[]) => {
  if (!first) return
  ctx.moveTo(first.x, first.y)
  // A single tap still leaves a dot: a zero-length line with round caps.
  for (const point of rest.length ? rest : [first]) ctx.lineTo(point.x, point.y)
}

const drawStroke = (ctx: Context, stroke: Stroke) => {
  const first = stroke.points[0]
  const last = stroke.points.at(-1)
  if (!first || !last) return
  ctx.save()
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = stroke.tool === 'highlighter' ? HIGHLIGHTER_ALPHA : 1
  ctx.beginPath()
  if (stroke.tool === 'rect') {
    ctx.strokeRect(first.x, first.y, last.x - first.x, last.y - first.y)
  } else if (stroke.tool === 'arrow') {
    const [left, right] = arrowHead(first, last, arrowHeadLengthOf(stroke.width))
    tracePath(ctx, [first, last])
    tracePath(ctx, [left, last, right])
  } else {
    tracePath(ctx, stroke.points)
  }
  ctx.stroke()
  ctx.restore()
}

/** Paints the strokes in order, in the image's own pixels. */
export const drawStrokes = (ctx: Context, strokes: readonly Stroke[]) => {
  for (const stroke of strokes) drawStroke(ctx, stroke)
}
