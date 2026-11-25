import { base64Bytes } from '@/utils/attachments'
import { MAX_IMAGE_BYTES, type ImageType } from '@/utils/content'
import type { Stroke } from '@/utils/markup'
import { drawStrokes } from '@/utils/markupCanvas'

/** JPEG quality when a marked PNG would be too large for the API. */
const FALLBACK_JPEG_QUALITY = 0.9

export class ImageTooLargeError extends Error {}

export interface EncodedImage {
  src: string
  mediaType: ImageType
  data: string
  bytes: number
}

/** The image at its natural resolution with the strokes and their numbers painted over it. */
const paint = async (
  src: string,
  strokes: readonly Stroke[],
  numbers: ReadonlyMap<string, number> = new Map()
) => {
  const image = new Image()
  image.src = src
  await image.decode()
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

const onBackdrop = (canvas: HTMLCanvasElement) => {
  const opaque = document.createElement('canvas')
  opaque.width = canvas.width
  opaque.height = canvas.height
  const ctx = opaque.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.fillStyle = JPEG_BACKDROP
  ctx.fillRect(0, 0, opaque.width, opaque.height)
  ctx.drawImage(canvas, 0, 0)
  return opaque
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
  const jpeg = await encode(onBackdrop(canvas), 'image/jpeg', FALLBACK_JPEG_QUALITY)
  if (jpeg.data.length <= MAX_IMAGE_BYTES) return jpeg
  throw new ImageTooLargeError()
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
