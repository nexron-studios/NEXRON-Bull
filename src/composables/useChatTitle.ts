import { computed } from 'vue'
import i18n from '@/i18n'
import { plainTitleOf, titlePiecesOf } from '@/utils/chatTitle'
import { IMAGE_REF_SLOTS, imageRefFormatOf } from '@/utils/imageRefs'

/**
 * A chat title with its image references read as images: as pieces for a chip where the title is
 * shown, as plain text ("Bild 1") where only text fits (tooltips, labels, toasts, notifications).
 * Through `i18n.global`, so stores can use it as well as components.
 */
export const useChatTitle = () => {
  const { t } = i18n.global
  const format = computed(() => imageRefFormatOf(t('images.reference', IMAGE_REF_SLOTS)))

  const piecesOf = (title: string) => titlePiecesOf(title, format.value)
  const plainOf = (title: string) =>
    plainTitleOf(title, format.value, (n) => t('chat.image_n', { n }))

  return { piecesOf, plainOf }
}
