<script setup lang="ts">
import { ref } from 'vue'
import { createReusableTemplate } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import ChatImageTooltip from '@/components/chat/ChatImageTooltip.vue'
import type { LightboxImage } from '@/utils/attachments'
import { naturalSizeOf, type Size } from '@/utils/markup'
import type { HighlightMark } from '@/utils/textPieces'

// The chip laid over an image reference's text (see ChatTextPieces). With the `image` behind it,
// as in a sent prompt, it is a button: hover tells name and size, a click opens the preview. In the
// composer's mirror it is only a picture, since the textarea above takes the pointer.
const { mark, image = null } = defineProps<{
  mark: Extract<HighlightMark, { kind: 'image' }>
  image?: LightboxImage | null
}>()
const emit = defineEmits<{ open: [n: number] }>()

const size = ref<Size | null>(null)

const { t } = useI18n()
const [DefineContent, ChipContent] = createReusableTemplate()

const CHIP =
  'absolute inset-x-0 top-1/2 flex h-5 -translate-y-1/2 items-center gap-1 overflow-hidden rounded-md bg-brand/15 pr-1.5 pl-0.5 text-small whitespace-nowrap ring-1 ring-brand/40 ring-inset'
</script>

<template>
  <DefineContent
    ><img
      :src="mark.src"
      alt=""
      class="size-4 shrink-0 rounded-sm object-cover"
      @load="size = naturalSizeOf($event)"
    /><span class="shrink-0 font-medium text-foreground">{{
      t('chat.image_n', { n: mark.n })
    }}</span
    ><span class="min-w-0 truncate text-muted-foreground">{{ mark.name }}</span></DefineContent
  >
  <ChatImageTooltip v-if="image" :name="image.name" :bytes="image.bytes" :size>
    <button
      type="button"
      :aria-label="t('chat.open_image', { name: image.name })"
      class="cursor-zoom-in transition-colors outline-none hover:bg-brand/25 focus-visible:ring-2 focus-visible:ring-ring"
      :class="CHIP"
      @click="emit('open', mark.n)"
    >
      <ChipContent />
    </button>
  </ChatImageTooltip>
  <span v-else aria-hidden="true" :class="CHIP"><ChipContent /></span>
</template>
