import { base64Bytes } from '@/utils/attachments'
import { MAX_IMAGE_BYTES, type ImageType } from '@/utils/content'
import type { Stroke } from '@/utils/markup'
import { drawStrokes } from '@/utils/markupCanvas'

/** JPEG quality when an image would be too large for the API as it is. */
const FALLBACK_JPEG_QUALITY = 0.9

export class ImageTooLargeError extends Error {}

export interface EncodedImage {
  src: string
  mediaType: ImageType
  data: string
  bytes: number
}

const decoded = async (src: string) => {
  const image = new Image()
  image.src = src
  await image.decode()
  return image
}

/** The image at its natural resolution with the strokes and their numbers painted over it. */
const paint = async (
  src: string,
  strokes: readonly Stroke[],
  numbers: ReadonlyMap<string, number> = new Map()
) => {
  const image = await decoded(src)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.drawImage(image, 0, 0)
  drawStrokes(ctx, strokes, numbers)
  return canvas
}

/** JPEG has no alpha; transparent pixels would turn black without a backdrop. */
const JPEG_BACKDROP = 'white'

const blobOf = (canvas: HTMLCanvasElement, mediaType: ImageType, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`${mediaType} encoding failed`))),
      mediaType,
      quality
    )
  )

const dataUrlOf = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

// toBlob encodes off the main thread; toDataURL froze the window on large photos.
const encode = async (
  canvas: HTMLCanvasElement,
  mediaType: ImageType,
  quality?: number
): Promise<EncodedImage> => {
  const src = await dataUrlOf(await blobOf(canvas, mediaType, quality))
  const data = src.slice(src.indexOf(',') + 1)
  return { src, mediaType, data, bytes: base64Bytes(data) }
}

interface Source {
  image: CanvasImageSource
  width: number
  height: number
}

/** The source scaled by `factor` on a backdrop, drawn in one go so no full-size copy is made first. */
const opaqueCopy = ({ image, width, height }: Source, factor: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * factor)
  canvas.height = Math.round(height * factor)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.fillStyle = JPEG_BACKDROP
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Each try scales both sides to this share of the try before. */
const SHRINK_STEP = 0.8
/** Text on a screenshot turns unreadable below this long side; such an image is refused instead. */
const MIN_LONG_SIDE_PX = 800
/** The API refuses an image with a longer side. */
const MAX_SIDE_PX = 8000
/** Safari's canvas area limit, the lowest of the webviews Bull runs in. */
const MAX_CANVAS_PIXELS = 4096 * 4096

/** JPEG, scaled down step by step until its base64 fits the API limit. */
const jpegThatFits = async (source: Source): Promise<EncodedImage> => {
  const longSide = Math.max(source.width, source.height)
  const pixels = source.width * source.height
  const first = Math.min(1, MAX_SIDE_PX / longSide, Math.sqrt(MAX_CANVAS_PIXELS / pixels))
  for (let factor = first; ; factor *= SHRINK_STEP) {
    const jpeg = await encode(opaqueCopy(source, factor), 'image/jpeg', FALLBACK_JPEG_QUALITY)
    if (jpeg.data.length <= MAX_IMAGE_BYTES) return jpeg
    if (longSide * factor * SHRINK_STEP < MIN_LONG_SIDE_PX) throw new ImageTooLargeError()
  }
}

/**
 * The image with its strokes burnt in. PNG keeps screenshots sharp; a photo that comes out over
 * the API limit as PNG falls back to JPEG instead of being refused.
 */
export const flattenImage = async (
  src: string,
  strokes: readonly Stroke[],
  numbers: ReadonlyMap<string, number>
): Promise<EncodedImage> => {
  const canvas = await paint(src, strokes, numbers)
  const png = await encode(canvas, 'image/png')
  if (png.data.length <= MAX_IMAGE_BYTES) return png
  return jpegThatFits({ image: canvas, width: canvas.width, height: canvas.height })
}

const shrinkNow = async (src: string) => {
  const image = await decoded(src)
  return jpegThatFits({ image, width: image.naturalWidth, height: image.naturalHeight })
}

// One shrink at a time: each holds canvases of up to 64 MB, and a drop of ten big screenshots
// would otherwise hold all of them at once. The caller gets each result or error from `run`.
let shrinkQueue: Promise<unknown> = Promise.resolve()

/** An attachment over the API limit, such as a full-screen screenshot on a 4K display, made to fit. */
export const shrinkImage = (src: string): Promise<EncodedImage> => {
  const run = shrinkQueue.then(() => shrinkNow(src))
  shrinkQueue = Promise.allSettled([run])
  return run
}

// Through the web clipboard: the Tauri plugin writes images only with an extra Rust feature, and
// the button click gives the window focus, which the web API needs. Chromium takes only PNG.
export const copyImage = async (src: string) => {
  const canvas = await paint(src, [])
  const blob = await blobOf(canvas, 'image/png')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export const downloadImage = (src: string, name: string) => {
  const link = document.createElement('a')
  link.href = src
  link.download = name
  link.click()
}
