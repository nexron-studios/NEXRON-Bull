import { useI18n } from 'vue-i18n'
import { useImageRefFormat } from '@/composables/useImageRefFormat'
import { plainTitleOf, titlePiecesOf } from '@/utils/chatTitle'

/**
 * A chat title with its image references read as images: as pieces for a chip where the title is
 * shown, as plain text ("Bild 1") where only text fits (tooltips, toasts, notifications).
 */
export const useChatTitle = () => {
  const { t } = useI18n()
  const format = useImageRefFormat()

  const piecesOf = (title: string) => titlePiecesOf(title, format.value)
  const plainOf = (title: string) =>
    plainTitleOf(title, format.value, (n) => t('chat.image_n', { n }))

  return { piecesOf, plainOf }
}
