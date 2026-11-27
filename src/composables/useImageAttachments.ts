import { computed, ref, type Ref } from 'vue'
import { toast } from '@/lib/toast'
import { useI18n } from 'vue-i18n'
import { ImageTooLargeError, shrinkImage } from '@/lib/imageExport'
import type { ImageType, PendingImage } from '@/utils/content'
import {
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_FILE_BYTES,
  formatBytes,
  groupRejected,
  placeMarked,
  renameExtension,
  sortIncoming,
  splitSettled,
  type Accepted,
  type RejectReason,
  type Rejected
} from '@/utils/attachments'
import { moveItem } from '@/utils/order'

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

/** The file's content as an attachment; one over the API limit as a smaller copy. */
const readAccepted = async ({
  file,
  mediaType,
  isOversized
}: Accepted<File>): Promise<Omit<PendingImage, 'id' | 'name'>> => {
  const src = await readAsDataUrl(file)
  if (isOversized) return shrinkImage(src)
  return { mediaType, src, data: src.slice(src.indexOf(',') + 1), bytes: file.size }
}

const REJECT_KEYS: Record<RejectReason, string> = {
  type: 'chat.image_wrong_type',
  size: 'chat.image_too_large',
  limit: 'chat.image_limit'
}

/**
 * Told when attachments were removed, moved or replaced (not when added), so text that refers to
 * them by position can follow. `successors` maps a replaced image to the one in its place.
 */
type RearrangeHandler = (
  before: PendingImage[],
  after: PendingImage[],
  successors: Record<string, string>
) => void

/**
 * Images waiting to go out with the next message, from paste, drop or file picker. The state can
 * live outside the component, so the attachments and the reads still running outlast it (the
 * composer keeps both per tab).
 */
export const useImageAttachments = (
  images: Ref<PendingImage[]> = ref([]),
  // Reads still running hold their slots, so two overlapping drops cannot overshoot the limit.
  readingCount: Ref<number> = ref(0),
  onRearrange: RearrangeHandler = () => {}
) => {
  const { t, locale } = useI18n()

  const isReading = computed(() => readingCount.value > 0)

  // A pasted screenshot can arrive without a file name.
  const nameOf = (name: string) => name || t('chat.image_unnamed')
  const namesOf = (names: string[]) => names.map(nameOf).join(', ')
  // A shrunk copy is a JPEG, so "shot.png" becomes "shot.jpg".
  const attachedNameOf = (file: File, mediaType: ImageType) =>
    file.name && mediaType !== file.type ? renameExtension(file.name, mediaType) : nameOf(file.name)

  const reportRejected = (rejected: Rejected[]) => {
    for (const { reason, names } of groupRejected(rejected)) {
      toast.error(
        t(REJECT_KEYS[reason], {
          names: namesOf(names),
          max:
            reason === 'size'
              ? formatBytes(MAX_IMAGE_FILE_BYTES, locale.value)
              : MAX_IMAGES_PER_MESSAGE
        })
      )
    }
  }

  const rearrange = (next: PendingImage[], successors: Record<string, string> = {}) => {
    const before = images.value
    images.value = next
    onRearrange(before, next, successors)
  }

  /** Reads the files and attaches what fits; gives back the images that arrived. */
  const addFiles = async (files: Iterable<File>): Promise<PendingImage[]> => {
    const { accepted, rejected } = sortIncoming(
      [...files],
      MAX_IMAGES_PER_MESSAGE - images.value.length - readingCount.value
    )
    reportRejected(rejected)
    if (!accepted.length) return []

    readingCount.value += accepted.length
    const results = await Promise.allSettled(accepted.map(readAccepted))
    readingCount.value -= accepted.length

    const { done, failed } = splitSettled(accepted, results)
    const added = done.map(({ item: { file }, value }) => ({
      id: crypto.randomUUID(),
      name: attachedNameOf(file, value.mediaType),
      ...value
    }))
    images.value = [...images.value, ...added]

    const tooLarge = failed.filter(({ reason }) => reason instanceof ImageTooLargeError)
    const unreadable = failed.filter(({ reason }) => !(reason instanceof ImageTooLargeError))
    reportRejected(tooLarge.map(({ item: { file } }) => ({ name: file.name, reason: 'size' })))
    if (unreadable.length) {
      console.warn('attachments.read_failed', { count: unreadable.length })
      toast.error(
        t('chat.image_read_failed', {
          names: namesOf(unreadable.map(({ item: { file } }) => file.name))
        })
      )
    }
    return added
  }

  const remove = (id: string) => {
    rearrange(images.value.filter((image) => image.id !== id))
  }

  /** One place earlier or later; Claude receives the images in this order. */
  const move = (id: string, step: -1 | 1) => {
    const from = images.value.findIndex((image) => image.id === id)
    rearrange(moveItem(images.value, from, from + step))
  }

  /** A new order from dragging the chips. */
  const reorder = (next: PendingImage[]) => rearrange(next)

  const clear = () => {
    images.value = []
  }

  /**
   * Marked images from the preview, in place of their source when that is still attached. False
   * when the message has no room left.
   */
  const placeMarkedImages = (sourceId: string | null, incoming: PendingImage[]) => {
    const replaced = images.value.some((image) => image.id === sourceId) ? 1 : 0
    const total = images.value.length - replaced + incoming.length + readingCount.value
    if (total > MAX_IMAGES_PER_MESSAGE) {
      toast.error(t('images.marked_limit', { max: MAX_IMAGES_PER_MESSAGE }))
      return false
    }
    // What referred to the source now means the marked copy, also when the original stays.
    const [marked] = incoming
    rearrange(
      placeMarked(images.value, sourceId, incoming),
      sourceId && marked ? { [sourceId]: marked.id } : {}
    )
    return true
  }

  return {
    images,
    readingCount,
    isReading,
    addFiles,
    remove,
    move,
    reorder,
    clear,
    placeMarkedImages
  }
}
