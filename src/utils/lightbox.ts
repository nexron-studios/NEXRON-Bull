import { isImageType, renameExtension, type LightboxImage } from '@/utils/attachments'
import type { ImageType, PendingImage } from '@/utils/content'

/** The preview either shows an image or draws on it. */
export const lightboxModeList = ['view', 'mark'] as const
export type LightboxMode = (typeof lightboxModeList)[number]

const DATA_URL = /^data:([^;,]+);base64,(.*)$/s

/** Media type and base64 of a data URL; `null` for anything Claude would not take as an image. */
export const parseDataUrl = (src: string): { mediaType: ImageType; data: string } | null => {
  const match = DATA_URL.exec(src)
  const [, mediaType = '', data = ''] = match ?? []
  if (!match || !isImageType(mediaType)) return null
  return { mediaType, data }
}

/**
 * A previewed image as a composer attachment. An attachment keeps its id, so it stays the same
 * item; an image from the history gets a new one.
 */
export const toPendingImage = (image: LightboxImage, newId: () => string): PendingImage | null => {
  const parsed = parseDataUrl(image.src)
  if (!parsed) return null
  return {
    id: image.id ?? newId(),
    name: image.name,
    src: image.src,
    bytes: image.bytes,
    isMarked: image.isMarked,
    ...parsed
  }
}

/** The marked copy: a new attachment under the source's name, with its new encoding's extension. */
export const markedCopyOf = (
  name: string,
  encoded: { src: string; mediaType: ImageType; data: string; bytes: number },
  id: string
): PendingImage => ({
  id,
  name: renameExtension(name, encoded.mediaType),
  isMarked: true,
  ...encoded
})
