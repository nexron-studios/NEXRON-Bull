import type { Ref } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import type { useImageReferences } from '@/composables/useImageReferences'
import type { MarkupHandoff, MarkupResult } from '@/composables/useMarkupTarget'
import { MAX_IMAGES_PER_MESSAGE } from '@/utils/attachments'
import type { PendingImage } from '@/utils/content'
import { withPlainImageRefs } from '@/utils/imageRefs'
import { noteTextOf, type MarkNote } from '@/utils/markup'

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

  const isAttached = (id: string | null) => images.value.some((image) => image.id === id)

  /** The attachment `id` with `notes` in place of the ones it had. */
  const setNotesOf = (id: string, notes: MarkNote[]) => {
    images.value = images.value.map((image) => (image.id === id ? { ...image, notes } : image))
  }

  /** The marked copy with every note on it; the images behind it go as they are. */
  const withNotes = (outgoing: PendingImage[], notes: MarkNote[]): PendingImage[] => {
    const [marked, ...rest] = outgoing
    return marked ? [{ ...marked, notes }, ...rest] : outgoing
  }

  /**
   * A marked image from the preview into the draft; nothing is sent. Its notes (the earlier ones
   * as changed there, then the new ones) go onto the attachment: the marked copy, or the image
   * itself when only its notes changed. They go into the text only when the message goes out, so
   * the draft names the image once, by its chip. A comment (only a sent image has a field for
   * one) goes in front of the draft as text to edit, naming the image by a reference.
   */
  const takeMarkup = ({ sourceId, images: incoming, comment, notes }: MarkupResult) => {
    if (incoming.length && !placeMarkedImages(sourceId, withNotes(incoming, notes))) return false
    if (!incoming.length && sourceId && isAttached(sourceId)) setNotesOf(sourceId, notes)
    // The comment line in front of a shell command would run as part of it.
    isShell.value = false
    const anchorId = incoming[0]?.id ?? sourceId
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

  /** The comment as the text of a message whose first image it is about; empty without one. */
  const commentLineOf = (image: PendingImage, comment: string) => {
    if (!comment) return ''
    const ref = references.format.value.render(1, image.name)
    return withPlainImageRefs(t('images.comment_line', { ref, comment }), references.format.value)
  }

  /**
   * "Senden" in the preview: the image goes out as a message of its own, by the same way as any
   * message (queue, limit). The comment is its text, to change like any text should the message
   * come back; the notes ride on the image and are written in as it leaves. The draft stays for
   * later; only an attachment that just went out leaves it, with its references. A shell command
   * waiting in the draft stays one: nothing is written into it.
   */
  const sendMarkup = ({ sourceId, images: outgoing, comment, notes }: MarkupResult) => {
    if (outgoing.length > MAX_IMAGES_PER_MESSAGE) {
      toast.error(t('images.marked_limit', { max: MAX_IMAGES_PER_MESSAGE }))
      return false
    }
    const [first] = outgoing
    if (first) {
      send(commentLineOf(first, comment), withNotes(outgoing, notes))
      if (sourceId && isAttached(sourceId)) remove(sourceId)
      return true
    }
    // An image Claude would not take (no base64 data URL) cannot go along; what was written about
    // it still can, and then no longer waits on the attachment to go out a second time.
    const text = [comment, ...notes.map(noteTextOf)].filter(Boolean).join(' ')
    if (!text) {
      toast.error(t('images.send_empty'))
      return false
    }
    send(text, [])
    if (sourceId && isAttached(sourceId)) setNotesOf(sourceId, [])
    return true
  }

  /** A result from the preview, wherever it was asked to go. */
  const handOver = (result: MarkupResult, handoff: MarkupHandoff) =>
    handoff === 'send' ? sendMarkup(result) : takeMarkup(result)

  return { handOver }
}
