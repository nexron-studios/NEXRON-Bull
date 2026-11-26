import { ref, watch, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import type { useMarkup } from '@/composables/useMarkup'
import type { MarkupHandoff, useMarkupTarget } from '@/composables/useMarkupTarget'
import { handleError } from '@/lib/error'
import { ImageTooLargeError, copyImage, downloadImage, flattenImage } from '@/lib/imageExport'
import { fileNameOf, type LightboxImage } from '@/utils/attachments'
import type { PendingImage } from '@/utils/content'
import { markedCopyOf, parseDataUrl, toPendingImage } from '@/utils/lightbox'

interface LightboxActionsOptions {
  current: Ref<LightboxImage | null>
  target: ReturnType<typeof useMarkupTarget>
  markup: ReturnType<typeof useMarkup>
  /** The result is in the composer; the preview can go */
  onApplied: () => void
}

const newId = () => crypto.randomUUID()

/** What the preview does with an image: copy, download, and hand the markup to the composer. */
export const useLightboxActions = ({
  current,
  target,
  markup,
  onApplied
}: LightboxActionsOptions) => {
  const isApplying = ref(false)
  // Set once the user was told that leaving drops the markup; the next attempt goes through.
  const hasWarned = ref(false)

  const { t } = useI18n()

  /** Unsaved work holds the first attempt to drop it with a warning; an export in flight all. */
  const mayDrop = (hasWork: boolean) => {
    if (isApplying.value) return false
    if (!hasWork || hasWarned.value) return true
    hasWarned.value = true
    toast.warning(t('images.close_warning'))
    return false
  }

  /** Closing or paging drops strokes and comment. */
  const mayLeave = () => mayDrop(markup.isDirty.value)

  // A comment alone on a history image brings a copy along, so Claude sees what it is about. An
  // attachment stays where it is for the composer, but a message sent from here needs it along.
  const imagesFor = async (
    image: LightboxImage,
    handoff: MarkupHandoff
  ): Promise<PendingImage[]> => {
    if (!markup.strokes.value.length) {
      const isInComposer = !!image.id && handoff === 'compose'
      const copy = isInComposer ? null : toPendingImage(image, newId)
      return copy ? [copy] : []
    }
    const encoded = await flattenImage(image.src, markup.strokes.value, markup.numbers.value)
    const marked = markedCopyOf(image.name, encoded, newId(), markup.markCount.value)
    const original = markup.isKeepingOriginal.value ? toPendingImage(image, newId) : null
    return original ? [marked, original] : [marked]
  }

  const apply = async (handoff: MarkupHandoff = 'compose') => {
    const image = current.value
    if (!image || !target || !markup.isDirty.value || isApplying.value) return
    isApplying.value = true
    try {
      const images = await imagesFor(image, handoff)
      // Discarded while the image was being encoded: the result is no longer wanted.
      if (!markup.isDirty.value) return
      const result = { sourceId: image.id ?? null, images }
      const text = { comment: markup.comment.value.trim(), notes: markup.allNotes.value }
      if (!target({ ...result, ...text }, handoff)) return
      markup.reset()
      onApplied()
    } catch (error) {
      if (error instanceof ImageTooLargeError) toast.error(t('images.too_large'))
      else handleError(error)
    } finally {
      isApplying.value = false
    }
  }

  const copy = async () => {
    const image = current.value
    if (!image) return
    try {
      await copyImage(image.src)
      toast.success(t('images.copied'))
    } catch (error) {
      console.warn('images.copy_failed', { message: String(error) })
      toast.error(t('images.copy_failed'))
    }
  }

  // History images are called "Image 2"; saved like that, no app would open the file.
  const download = () => {
    const image = current.value
    if (!image) return
    const mediaType = parseDataUrl(image.src)?.mediaType
    downloadImage(image.src, mediaType ? fileNameOf(image.name, mediaType) : image.name)
  }

  // New strokes after the warning deserve a warning of their own.
  watch([markup.strokes, markup.comment, markup.notes], () => {
    hasWarned.value = false
  })

  return { isApplying, mayLeave, apply, copy, download }
}
