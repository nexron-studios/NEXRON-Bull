import type { Ref } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import type { useImageReferences } from '@/composables/useImageReferences'
import type { MarkupHandoff, MarkupResult } from '@/composables/useMarkupTarget'
import { MAX_IMAGES_PER_MESSAGE } from '@/utils/attachments'
import type { PendingImage } from '@/utils/content'
import { withPlainImageRefs } from '@/utils/imageRefs'

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

  /**
   * A marked image from the preview, its comment in front of the draft; nothing is sent. The
   * comment names the image by a reference, so it follows the chips like any other.
   */
  const takeMarkup = ({ sourceId, images: incoming, comment }: MarkupResult) => {
    if (incoming.length && !placeMarkedImages(sourceId, incoming)) return false
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

  /** The comment, naming the image it goes with as image 1 of the new message. */
  const messageTextOf = (image: PendingImage | undefined, comment: string) => {
    if (!image || !comment) return comment
    const ref = references.format.value.render(1, image.name)
    return withPlainImageRefs(t('images.comment_line', { ref, comment }), references.format.value)
  }

  /**
   * "Senden" in the preview: image and comment go out as a message of their own, by the same way
   * as any message (queue, limit). The draft stays for later; only an attachment that just went
   * out leaves it, with its references. A shell command waiting in the draft stays one: nothing
   * is written into it.
   */
  const sendMarkup = ({ sourceId, images: outgoing, comment }: MarkupResult) => {
    if (outgoing.length > MAX_IMAGES_PER_MESSAGE) {
      toast.error(t('images.marked_limit', { max: MAX_IMAGES_PER_MESSAGE }))
      return false
    }
    // An image Claude would not take (no base64 data URL) cannot go along; its comment still can.
    const [first] = outgoing
    if (!first && !comment) {
      toast.error(t('images.send_empty'))
      return false
    }
    send(messageTextOf(first, comment), outgoing)
    if (first && sourceId && images.value.some((image) => image.id === sourceId)) remove(sourceId)
    return true
  }

  /** A result from the preview, wherever it was asked to go. */
  const handOver = (result: MarkupResult, handoff: MarkupHandoff) =>
    handoff === 'send' ? sendMarkup(result) : takeMarkup(result)

  return { handOver }
}
