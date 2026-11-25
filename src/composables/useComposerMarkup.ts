import { nextTick, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { useImageReferences } from '@/composables/useImageReferences'
import type { MarkupHandoff, MarkupResult } from '@/composables/useMarkupTarget'
import type { PendingImage } from '@/utils/content'
import { withPlainImageRefs } from '@/utils/imageRefs'

interface ComposerMarkupOptions {
  images: Ref<PendingImage[]>
  isShell: Ref<boolean>
  references: ReturnType<typeof useImageReferences>
  /** False when the message has no room left */
  placeMarkedImages: (sourceId: string | null, incoming: PendingImage[]) => boolean
  remove: (id: string) => void
  /** The preview of the attachment at `at`, from 0 */
  openAt: (at: number) => void
  /** A line in front of the draft, the field focused */
  prependComment: (line: string) => void
  focusField: () => void
  /** The composer's own way out, so a message from here queues and waits like any other */
  send: (text: string, images: PendingImage[]) => void
}

/**
 * The composer's side of the image preview: opening an attachment in it, and taking back what was
 * marked there, either into the draft ("Ins Eingabefeld") or out as a message ("Senden").
 */
export const useComposerMarkup = ({
  images,
  isShell,
  references,
  placeMarkedImages,
  remove,
  openAt,
  prependComment,
  focusField,
  send
}: ComposerMarkupOptions) => {
  const { t } = useI18n()

  /** The preview of an attachment; the list may only just have appeared with it. */
  const openImage = async (id: string) => {
    await nextTick()
    openAt(images.value.findIndex((image) => image.id === id))
  }

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

  /**
   * "Senden" in the preview: image and comment go out as a message of their own, by the same way
   * as any message (queue, limit). The draft stays for later; only an attachment that just went
   * out leaves it, with its references. A shell command waiting in the draft stays one: nothing
   * is written into it.
   */
  const sendMarkup = ({ sourceId, images: outgoing, comment }: MarkupResult) => {
    const [first] = outgoing
    if (!first) return false
    const ref = references.format.value.render(1, first.name)
    const text = comment ? t('images.comment_line', { ref, comment }) : ''
    send(withPlainImageRefs(text, references.format.value), outgoing)
    if (sourceId && images.value.some((image) => image.id === sourceId)) remove(sourceId)
    return true
  }

  /** A result from the preview, wherever it was asked to go. */
  const handOver = (result: MarkupResult, handoff: MarkupHandoff) =>
    handoff === 'send' ? sendMarkup(result) : takeMarkup(result)

  return { openImage, handOver }
}
