<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatImageTooltip from '@/components/chat/ChatImageTooltip.vue'
import type { LightboxImage } from '@/utils/attachments'
import { naturalSizeOf, type Size } from '@/utils/markup'

// A sent image in the history (Figma "20c"): 160 × 100 tile, the name cut below it.
const { image } = defineProps<{ image: LightboxImage }>()
const emit = defineEmits<{ open: [] }>()

const size = ref<Size | null>(null)

const { t } = useI18n()
</script>

<template>
  <ChatImageTooltip :name="image.name" :bytes="image.bytes" :size>
    <button
      type="button"
      :aria-label="t('chat.open_image', { name: image.name })"
      class="flex w-40 cursor-zoom-in flex-col gap-1 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      @click="emit('open')"
    >
      <img
        :src="image.src"
        alt=""
        loading="lazy"
        width="160"
        height="100"
        class="h-25 w-40 rounded-xl border border-border object-cover"
        @load="size = naturalSizeOf($event)"
      />
      <span class="truncate px-0.5 text-meta text-muted-foreground">{{ image.name }}</span>
    </button>
  </ChatImageTooltip>
</template>
