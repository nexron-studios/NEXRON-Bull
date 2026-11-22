/** Drawing on an image in the preview: tools, strokes, undo history and sizes. */

export const markupToolList = ['pen', 'highlighter', 'arrow', 'rect', 'eraser'] as const
export type MarkupTool = (typeof markupToolList)[number]
/** The tools that leave a stroke; the eraser only removes them. */
export type DrawTool = Exclude<MarkupTool, 'eraser'>

/** Status and brand tokens, so markings read like the rest of the app. */
export const markupColorList = ['critical', 'warning', 'good', 'brand', 'white'] as const
export type MarkupColor = (typeof markupColorList)[number]

export const markupSizeList = ['s', 'm', 'l'] as const
export type MarkupSize = (typeof markupSizeList)[number]

export const MARKUP_COLOR_TOKENS: Record<MarkupColor, string> = {
  critical: '--critical',
  warning: '--warning',
  good: '--good',
  brand: '--brand',
  white: '--stage-foreground'
}

/** Line width in screen pixels; it is converted to image pixels when a stroke starts. */
export const MARKUP_SIZE_PX: Record<MarkupSize, number> = { s: 2, m: 4, l: 8 }

/** The highlighter is a wide, see-through marker over the same sizes. */
export const HIGHLIGHTER_WIDTH_FACTOR = 4
export const HIGHLIGHTER_ALPHA = 0.35

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/** One mark in the image's own pixels, so it lands at the natural resolution when flattened. */
export interface Stroke {
  tool: DrawTool
  /** Resolved CSS colour, so a theme switch does not repaint finished marks */
  color: string
  width: number
  /** Freehand tools: the whole path. Arrow and frame: start and end. */
  points: Point[]
}

export interface MarkupHistory {
  past: Stroke[][]
  present: Stroke[]
  future: Stroke[][]
}

export const emptyHistory = (): MarkupHistory => ({ past: [], present: [], future: [] })

/** A new state of the drawing; whatever was undone before is gone. */
export const commitStrokes = (history: MarkupHistory, next: Stroke[]): MarkupHistory => ({
  past: [...history.past, history.present],
  present: next,
  future: []
})

export const undoHistory = (history: MarkupHistory): MarkupHistory => {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  }
}

export const redoHistory = (history: MarkupHistory): MarkupHistory => {
  const [next, ...rest] = history.future
  if (!next) return history
  return { past: [...history.past, history.present], present: next, future: rest }
}

/** Width of a new stroke in image pixels, so it looks as wide as chosen on screen. */
export const strokeWidthOf = (tool: DrawTool, size: MarkupSize, imageToScreen: number) => {
  const factor = tool === 'highlighter' ? HIGHLIGHTER_WIDTH_FACTOR : 1
  return (MARKUP_SIZE_PX[size] * factor) / imageToScreen
}

/** Where a pointer at client coordinates sits on an image drawn into `rect`, in image pixels. */
export const toImagePoint = (
  client: Point,
  rect: { left: number; top: number; width: number; height: number },
  natural: Size
): Point => ({
  x: ((client.x - rect.left) / rect.width) * natural.width,
  y: ((client.y - rect.top) / rect.height) * natural.height
})

export const distanceToSegment = (point: Point, from: Point, to: Point) => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  const along =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)
        )
  return Math.hypot(point.x - (from.x + along * dx), point.y - (from.y + along * dy))
}

/** The eraser is a round brush, wider than the pen at the same size so it is quick to wipe with. */
export const ERASER_WIDTH_FACTOR = 6

/** Radius of the eraser in image pixels, so it is as wide as chosen on screen. */
export const eraserRadiusOf = (size: MarkupSize, imageToScreen: number) =>
  (MARKUP_SIZE_PX[size] * ERASER_WIDTH_FACTOR) / 2 / imageToScreen

const ARROW_HEAD_ANGLE = Math.PI / 6

/** The two outer points of an arrow head at `to`, each `length` away from the tip. */
export const arrowHead = (from: Point, to: Point, length: number): [Point, Point] => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const side = (turn: number): Point => ({
    x: to.x - length * Math.cos(angle + turn),
    y: to.y - length * Math.sin(angle + turn)
  })
  return [side(ARROW_HEAD_ANGLE), side(-ARROW_HEAD_ANGLE)]
}

/** The head grows with the line, but stays readable on a thin one. */
const ARROW_HEAD_PER_WIDTH = 4
const MIN_ARROW_HEAD = 12

export const arrowHeadLengthOf = (width: number) =>
  Math.max(width * ARROW_HEAD_PER_WIDTH, MIN_ARROW_HEAD)

/** Pixel size of an `<img>` from its load event. */
export const naturalSizeOf = (event: Event): Size => {
  const image = event.target as HTMLImageElement
  return { width: image.naturalWidth, height: image.naturalHeight }
}

/** The largest size that fits `box` without scaling the image up. */
export const fitSize = (natural: Size, box: Size): Size => {
  if (!natural.width || !natural.height) return { width: 0, height: 0 }
  const scale = Math.min(box.width / natural.width, box.height / natural.height, 1)
  return { width: natural.width * scale, height: natural.height * scale }
}

/** Zoom levels of the preview, relative to the fitted size. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4] as const

export const stepZoom = (zoom: number, direction: -1 | 1) => {
  const next =
    direction > 0
      ? ZOOM_STEPS.find((step) => step > zoom)
      : [...ZOOM_STEPS].reverse().find((step) => step < zoom)
  return next ?? zoom
}
