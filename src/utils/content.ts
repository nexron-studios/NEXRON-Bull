import type { PromptBlock } from '@/types/agentd.type'

/** Image types the Claude API accepts in a message. */
export const imageTypeList = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export type ImageType = (typeof imageTypeList)[number]

/** The API limit per image, measured on the base64 text that is sent. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export interface PendingImage {
  id: string
  name: string
  mediaType: ImageType
  /** Base64 without the data-URL prefix */
  data: string
  /** The same image as a data URL, built once for thumbnails and the lightbox */
  src: string
  /** File size before encoding */
  bytes: number
  /** Drawn on in the preview; the chip shows a pen */
  isMarked?: boolean
  /** Numbers burnt into the image by earlier marking, so a next round goes on after them */
  markCount?: number
  /**
   * The notes of its marks behind their numbers ("① bigger"), every round so far. They stay on the
   * attachment and are written into the text only when the message goes out.
   */
  notes?: string[]
}

/** One user turn as Anthropic content blocks: images first, then the text. */
export const buildContent = (text: string, images: PendingImage[]): PromptBlock[] => [
  ...images.map((image): PromptBlock => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: image.data }
  })),
  ...(text ? [{ type: 'text' as const, text }] : [])
]
