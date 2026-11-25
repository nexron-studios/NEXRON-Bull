import type { Ref } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import type { useImageReferences } from '@/composables/useImageReferences'
import type { MarkupHandoff, MarkupResult } from '@/composables/useMarkupTarget'
import { MAX_IMAGES_PER_MESSAGE } from '@/utils/attachments'
import type { PendingImage } from '@/utils/content'

interface ComposerMarkupOptions {
  images: Ref<PendingImage[]>
  isShell: Ref<boolean>
  references: ReturnType<typeof useImageReferences>
  /** False when the message has no room left */
  placeMarkedImages: (sourceId: string | null, incoming: PendingImage[]) => boolean
  remove: (id: string) => void
  /** A line in front of the draft, the field focused */
  prependComment: (line: string) => void
  focusField: () => void
  /** The composer's own way out, so a message from here queues and waits like any other */
  send: (text: string, images: PendingImage[]) => void
}

/**
 * The composer's side of the image preview: taking back what was marked there, either into the
 * draft ("Ins Eingabefeld") or out as a message ("Senden").
 */
export const useComposerMarkup = ({
  images,
  isShell,
  references,
  placeMarkedImages,
  remove,
  prependComment,
  focusField,
  send
}: ComposerMarkupOptions) => {
  const { t } = useI18n()

  /** The notes the attachment `id` has from earlier rounds; none for an image from the history. */
  const earlierNotesOf = (id: string | null) =>
    images.value.find((image) => image.id === id)?.notes ?? []

  /** The marked copy with every note so far on it; the images behind it go as they are. */
  const withNotes = (outgoing: PendingImage[], notes: readonly string[]): PendingImage[] => {
    const [marked, ...rest] = outgoing
    if (!marked || !notes.length) return outgoing
    return [{ ...marked, notes: [...notes] }, ...rest]
  }

  /**
   * A marked image from the preview into the draft; nothing is sent. Its notes go onto the
   * attachment, after those of earlier rounds, and into the text only when the message goes out,
   * so the draft names the image once, by the chip it has. A comment (only a sent image has a
   * field for one) goes in front of the draft as text to edit, naming the image by a reference.
   */
  const takeMarkup = ({ sourceId, images: incoming, comment, notes }: MarkupResult) => {
    const noted = withNotes(incoming, [...earlierNotesOf(sourceId), ...notes])
    if (noted.length && !placeMarkedImages(sourceId, noted)) return false
    // The comment line in front of a shell command would run as part of it.
    isShell.value = false
    const anchorId = noted[0]?.id ?? sourceId
    const at = images.value.findIndex((image) => image.id === anchorId)
    const anchor = images.value[at]
    if (!comment || !anchor) {
      focusField()
      return true
    }
    const ref = references.format.value.render(at + 1, anchor.name)
    prependComment(t('images.comment_line', { ref, comment }))
    return true
  }

  /**
   * "Senden" in the preview: the image goes out as a message of its own, by the same way as any
   * message (queue, limit), the comment and every note so far on it, written into the text as the
   * message leaves. The draft stays for later; only an attachment that just went out leaves it,
   * with its references. A shell command waiting in the draft stays one: nothing is written into
   * it.
   */
  const sendMarkup = ({ sourceId, images: outgoing, comment, notes }: MarkupResult) => {
    if (outgoing.length > MAX_IMAGES_PER_MESSAGE) {
      toast.error(t('images.marked_limit', { max: MAX_IMAGES_PER_MESSAGE }))
      return false
    }
    const allNotes = [comment, ...earlierNotesOf(sourceId), ...notes].filter(Boolean)
    // An image Claude would not take (no base64 data URL) cannot go along; its words still can.
    if (!outgoing.length) {
      if (!allNotes.length) toast.error(t('images.send_empty'))
      else send(allNotes.join(' '), [])
      return allNotes.length > 0
    }
    send('', withNotes(outgoing, allNotes))
    if (sourceId && images.value.some((image) => image.id === sourceId)) remove(sourceId)
    return true
  }

  /** A result from the preview, wherever it was asked to go. */
  const handOver = (result: MarkupResult, handoff: MarkupHandoff) =>
    handoff === 'send' ? sendMarkup(result) : takeMarkup(result)

  return { handOver }
}
