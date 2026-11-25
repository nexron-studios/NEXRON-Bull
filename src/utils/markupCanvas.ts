import {
  HIGHLIGHTER_ALPHA,
  arrowHead,
  arrowHeadLengthOf,
  TEXT_OUTLINE_PER_SIZE,
  type LineStroke,
  type Point,
  type Stroke,
  type TextStroke
} from '@/utils/markup'

type Context = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'stroke'
  | 'fill'
  | 'strokeRect'
  | 'strokeText'
  | 'fillText'
  | 'save'
  | 'restore'
  | 'globalAlpha'
  | 'strokeStyle'
  | 'fillStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
>

// Numbers and text get a dark edge and white digits, so they read on any colour and any image
// without knowing how light the chosen colour is.
const OUTLINE = 'rgba(0, 0, 0, 0.6)'
const BADGE_DIGITS = 'white'
const BADGE_RING_PER_RADIUS = 0.16
const BADGE_FONT_PER_RADIUS = 1.1
const FONT_FAMILY = 'system-ui, sans-serif'

/** Font of a written text. */
export const textFontOf = (size: number) => `600 ${size}px ${FONT_FAMILY}`

const tracePath = (ctx: Context, [first, ...rest]: readonly Point[]) => {
  if (!first) return
  ctx.moveTo(first.x, first.y)
  // A single tap still leaves a dot: a zero-length line with round caps.
  for (const point of rest.length ? rest : [first]) ctx.lineTo(point.x, point.y)
}

const drawLine = (ctx: Context, stroke: LineStroke) => {
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

const drawText = (ctx: Context, stroke: TextStroke) => {
  const [at] = stroke.points
  ctx.save()
  ctx.font = textFontOf(stroke.size)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  ctx.lineWidth = stroke.size * TEXT_OUTLINE_PER_SIZE
  ctx.strokeStyle = OUTLINE
  ctx.strokeText(stroke.text, at.x, at.y)
  ctx.fillStyle = stroke.color
  ctx.fillText(stroke.text, at.x, at.y)
  ctx.restore()
}

/** A filled circle in the mark's colour, with its number when it has one. */
const drawBadge = (ctx: Context, stroke: Stroke, number: number | undefined) => {
  const at = stroke.anchor
  const radius = stroke.badge
  ctx.save()
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = stroke.color
  ctx.fill()
  ctx.lineWidth = radius * BADGE_RING_PER_RADIUS
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  if (number !== undefined) {
    ctx.font = `700 ${radius * BADGE_FONT_PER_RADIUS}px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.strokeText(String(number), at.x, at.y)
    ctx.fillStyle = BADGE_DIGITS
    ctx.fillText(String(number), at.x, at.y)
  }
  ctx.restore()
}

/**
 * Paints the marks in order, in the image's own pixels, then the number badges on top so no
 * later line covers a number. A mark the eraser cut in pieces gets its badge once.
 */
export const drawStrokes = (
  ctx: Context,
  strokes: readonly Stroke[],
  numbers: ReadonlyMap<string, number> = new Map()
) => {
  for (const stroke of strokes) {
    if (stroke.tool === 'text') drawText(ctx, stroke)
    else if (stroke.tool !== 'pin') drawLine(ctx, stroke)
  }
  const badged = new Set<string>()
  for (const stroke of strokes) {
    if (badged.has(stroke.id)) continue
    if (stroke.tool !== 'pin' && !numbers.has(stroke.id)) continue
    badged.add(stroke.id)
    drawBadge(ctx, stroke, numbers.get(stroke.id))
  }
}
