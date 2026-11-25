import { prependLine } from '@/utils/attachments'
import type { PendingImage } from '@/utils/content'
import type { MarkNote } from '@/utils/markup'

/**
 * The text of a message with the notes of its marked images in front: one line per image with
 * notes, naming it ("Zu [Bild 2 (name)]: ① smaller ② bluer"). The notes live on the attachments
 * until the message goes out, so they follow their image through every move and removal, and the
 * draft and the held messages keep only what the user typed. `lineOf` writes one image's line;
 * `n` is its number in the message, from 1.
 */
export const withImageNotes = (
  text: string,
  images: readonly PendingImage[],
  lineOf: (n: number, image: PendingImage, notes: readonly MarkNote[]) => string
) => {
  const lines = images.flatMap((image, at) =>
    image.notes?.length ? [lineOf(at + 1, image, image.notes)] : []
  )
  return lines.length ? prependLine(text, lines.join('\n')) : text
}
