<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ChatImageTile from '@/components/chat/ChatImageTile.vue'
import type { LightboxImage } from '@/utils/attachments'

// The images of a sent message as tiles; the message opens the preview, so the chips in its text
// open the same one.
const { images } = defineProps<{ images: LightboxImage[] }>()
const emit = defineEmits<{ open: [at: number] }>()

const { t } = useI18n()
</script>

<template>
  <ul :aria-label="t('chat.attachments')" class="flex max-w-xl flex-wrap justify-end gap-2">
    <li v-for="(image, at) in images" :key="at">
      <ChatImageTile :image @open="emit('open', at)" />
    </li>
  </ul>
</template>
