<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatImageLightbox from '@/components/chat/ChatImageLightbox.vue'
import ChatImageTile from '@/components/chat/ChatImageTile.vue'
import { useImageNameScope } from '@/composables/useImageNameScope'
import { useImageNameStore } from '@/stores/imageNames'
import { blockImages, type ImageBlock } from '@/utils/attachments'

const { blocks, texts } = defineProps<{
  blocks: ImageBlock[]
  /** The message's texts, to find the names the images had in the composer */
  texts: string[]
}>()

const isOpen = ref(false)
const index = ref(0)

const { t } = useI18n()
const imageNames = useImageNameStore()
const scope = useImageNameScope()

// Sent from this app: the name it had in the composer; otherwise "Image 2".
const images = computed(() => {
  const names = scope ? imageNames.namesOf(scope.value, texts, blocks.length) : []
  return blockImages(blocks, (n) => names[n - 1] ?? t('chat.image_n', { n }))
})

const openAt = (at: number) => {
  index.value = at
  isOpen.value = true
}
</script>

<template>
  <ul :aria-label="t('chat.attachments')" class="flex max-w-xl flex-wrap justify-end gap-2">
    <li v-for="(image, at) in images" :key="at">
      <ChatImageTile :image @open="openAt(at)" />
    </li>
  </ul>
  <ChatImageLightbox v-model:open="isOpen" v-model:index="index" :images />
</template>
