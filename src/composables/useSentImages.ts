import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useImageNameScope } from '@/composables/useImageNameScope'
import { useImageNameStore } from '@/stores/imageNames'
import { blockImages, type ImageBlock } from '@/utils/attachments'

/**
 * The images of a sent message as the preview shows them. Sent from this app, each keeps the name
 * it had in the composer (found by the message's texts); otherwise it is "Image 2".
 */
export const useSentImages = (blocks: () => ImageBlock[], texts: () => string[]) => {
  const { t } = useI18n()
  const imageNames = useImageNameStore()
  const scope = useImageNameScope()

  return computed(() => {
    const all = blocks()
    const names = scope ? imageNames.namesOf(scope.value, texts(), all.length) : []
    return blockImages(all, (n) => names[n - 1] ?? t('chat.image_n', { n }))
  })
}
