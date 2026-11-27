import type { Block } from '@/types/agentd.type'
import { MAX_IMAGE_BYTES, imageTypeList, type ImageType } from '@/utils/content'
import type { MarkNote, Size } from '@/utils/markup'

/** More images than this make one turn slow and expensive; the API allows more, the chat does not need them. */
export const MAX_IMAGES_PER_MESSAGE = 10

export const rejectReasonList = ['type', 'size', 'shrink', 'limit'] as const
export type RejectReason = (typeof rejectReasonList)[number]

export type ImageBlock = Extract<Block, { type: 'image' }>

interface FileLike {
  name: string
  type: string
  size: number
}

export interface Rejected {
  name: string
  reason: RejectReason
}

export interface Accepted<T> {
  file: T
  mediaType: ImageType
  /** Over the API limit as it is; attached as a smaller copy */
  isOversized: boolean
}

export const isImageType = (type: string): type is ImageType =>
  (imageTypeList as readonly string[]).includes(type)

/** Size of a file once it is base64 text, which is what the API limit counts. */
export const encodedBytes = (size: number) => Math.ceil(size / 3) * 4

/** The largest file whose base64 text still fits `MAX_IMAGE_BYTES`, for the message shown to the user. */
export const MAX_IMAGE_FILE_BYTES = Math.floor(MAX_IMAGE_BYTES / 4) * 3

/**
 * A smaller copy keeps only the first frame. A GIF that large is almost always animated, so it is
 * refused; an animated WebP or PNG that large is rare enough to lose its motion.
 */
const canShrink = (type: ImageType) => type !== 'image/gif'

/**
 * Splits incoming files into those that fit into `room` free slots and those turned away, with the reason.
 * Entries without a type (dropped folders) are skipped silently: they are not files the user meant to send.
 */
export const sortIncoming = <T extends FileLike>(files: readonly T[], room: number) =>
  files.reduce<{ accepted: Accepted<T>[]; rejected: Rejected[] }>(
    (result, file) => {
      const reject = (reason: RejectReason) => ({
        ...result,
        rejected: [...result.rejected, { name: file.name, reason }]
      })
      if (!file.type) return result
      if (!isImageType(file.type)) return reject('type')
      const isOversized = encodedBytes(file.size) > MAX_IMAGE_BYTES
      if (isOversized && !canShrink(file.type)) return reject('size')
      if (result.accepted.length >= room) return reject('limit')
      return {
        ...result,
        accepted: [...result.accepted, { file, mediaType: file.type, isOversized }]
      }
    },
    { accepted: [], rejected: [] }
  )

/** Rejected file names per reason, so one toast covers a whole drop. */
export const groupRejected = (rejected: readonly Rejected[]) =>
  rejectReasonList
    .map((reason) => ({
      reason,
      names: rejected.filter((item) => item.reason === reason).map((item) => item.name)
    }))
    .filter((group) => group.names.length > 0)

/** Pairs each item with its settled result: the values that arrived and the items that failed, with why. */
export const splitSettled = <T, V>(
  items: readonly T[],
  results: readonly PromiseSettledResult<V>[]
) =>
  items.reduce<{ done: { item: T; value: V }[]; failed: { item: T; reason: unknown }[] }>(
    (split, item, at) => {
      const result = results[at]
      return result?.status === 'fulfilled'
        ? { ...split, done: [...split.done, { item, value: result.value }] }
        : { ...split, failed: [...split.failed, { item, reason: result?.reason }] }
    },
    { done: [], failed: [] }
  )

/** One image as the lightbox shows it. */
export interface LightboxImage {
  src: string
  name: string
  bytes: number
  /** Set for an attachment still in the composer, which markup then replaces */
  id?: string
  /** Drawn on in the preview; the chip shows a pen */
  isMarked?: boolean
  /** Numbers burnt into the image by earlier marking, so a next round goes on after them */
  markCount?: number
  /** An attachment's notes from earlier rounds, open to change in the preview */
  notes?: MarkNote[]
}

export const toDataUrl = (mediaType: string, data: string) => `data:${mediaType};base64,${data}`

/** Decoded size of a base64 string without decoding it. */
export const base64Bytes = (data: string) => {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.floor((data.length * 3) / 4) - padding
}

const KILOBYTE = 1024
const MEGABYTE = KILOBYTE * 1024

export const formatBytes = (bytes: number, locale: string) => {
  if (bytes < KILOBYTE) {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'byte' }).format(bytes)
  }
  if (bytes < MEGABYTE) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'kilobyte',
      maximumFractionDigits: 0
    }).format(bytes / KILOBYTE)
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: 2
  }).format(bytes / MEGABYTE)
}

/** Steps through a gallery and wraps around at both ends. */
export const stepIndex = (index: number, delta: number, length: number) =>
  (((index + delta) % length) + length) % length

export const imageBlocksOf = (blocks: readonly Block[]) =>
  blocks.filter((block): block is ImageBlock => block.type === 'image')

/** The images of a sent message; the transcript carries no file name, so `nameOf` finds or numbers one. */
export const blockImages = (blocks: readonly ImageBlock[], nameOf: (n: number) => string) =>
  blocks.map((block, index): LightboxImage => ({
    src: toDataUrl(block.media_type, block.data),
    name: nameOf(index + 1),
    bytes: base64Bytes(block.data)
  }))

/**
 * Recognises a sent prompt again in the history by its text and image count. The pixels do not
 * work: Claude Code stores pasted images re-encoded as JPEG in the transcript.
 */
export const promptKeyOf = (texts: readonly string[], imageCount: number) =>
  `${imageCount}|${texts.map((text) => text.trim()).join('\n')}`

/** "1280 × 720 · 240 kB", or only the size while the dimensions are not known yet. */
export const imageMeta = (bytes: number, locale: string, size?: Size | null) => {
  const formatted = formatBytes(bytes, locale)
  return size ? `${size.width} × ${size.height} · ${formatted}` : formatted
}

/** The browser names every pasted screenshot "image.png"; such a name says nothing. */
export const isGenericPasteName = (name: string) => !name || /^image\.\w+$/i.test(name)

const pad = (value: number) => String(value).padStart(2, '0')

/** Time of day for a generated file name; dashes, because Windows forbids colons there. */
export const clockStamp = (date: Date) =>
  `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`

const EXTENSIONS: Partial<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

/** File extension of a media type; PNG for anything unknown, since that is what markup writes. */
export const extensionOf = (mediaType: string) => EXTENSIONS[mediaType] ?? 'png'

/** The marked copy keeps the name and gets the extension of its new encoding. */
export const renameExtension = (name: string, mediaType: ImageType) => {
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.${extensionOf(mediaType)}`
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp)$/i

/**
 * A file name for saving: the name as shown, with the extension of the actual type. Claude Code
 * keeps pasted images as JPEG, so "shot.png" from the history is saved as "shot.jpg".
 */
export const fileNameOf = (name: string, mediaType: ImageType) =>
  `${name.replace(IMAGE_EXTENSION, '')}.${extensionOf(mediaType)}`

/** "Bild 12-03-04.png", or "Bild 12-03-04 (2).png" when that name is already taken. */
export const uniqueName = (name: string, taken: readonly string[]) => {
  const dot = name.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  let candidate = name
  for (let n = 2; taken.includes(candidate); n++) candidate = `${stem} (${n})${ext}`
  return candidate
}

const ELLIPSIS = '…'

/** Cuts a name after `max` characters and marks the cut. */
export const truncateName = (name: string, max: number) =>
  name.length > max ? `${name.slice(0, max).trimEnd()}${ELLIPSIS}` : name

/** Puts a line in front of the draft, a blank line between them. */
export const prependLine = (draft: string, line: string) =>
  draft.trim() ? `${line}\n\n${draft}` : line

/**
 * Where marked images land in the attachments: in place of their source when it is still there,
 * otherwise at the end. `incoming` is the marked copy, optionally followed by the original.
 */
export const placeMarked = <T extends { id: string }>(
  images: readonly T[],
  sourceId: string | null,
  incoming: readonly T[]
) => {
  const at = sourceId ? images.findIndex((image) => image.id === sourceId) : -1
  if (at < 0) return [...images, ...incoming]
  return [...images.slice(0, at), ...incoming, ...images.slice(at + 1)]
}
