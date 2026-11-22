<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { useElementSize, useSwipe } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import ChatMarkupCanvas from '@/components/chat/ChatMarkupCanvas.vue'
import type { LightboxImage } from '@/utils/attachments'
import { fitSize, naturalSizeOf, type Size } from '@/utils/markup'

// The image in the middle of the preview, fitted and zoomed, with the drawing layer on top while
// marking. Desktop pages with arrows on the image, phones by swiping it.
const { image, natural, zoom, isMarking, canPage, isPhone } = defineProps<{
  image: LightboxImage
  natural: Size | null
  zoom: number
  isMarking: boolean
  canPage: boolean
  isPhone: boolean
}>()
const emit = defineEmits<{ step: [delta: number]; load: [size: Size] }>()

const stage = ref<HTMLElement | null>(null)

const { t } = useI18n()
const box = useElementSize(stage)

const shown = computed(() => {
  if (!natural) return null
  const fitted = fitSize(natural, { width: box.width.value, height: box.height.value })
  return { width: fitted.width * zoom, height: fitted.height * zoom }
})

useSwipe(stage, {
  onSwipeEnd: (_event, direction) => {
    if (!canPage || isMarking) return
    if (direction === 'left') emit('step', 1)
    else if (direction === 'right') emit('step', -1)
  }
})

// Focus the image, not the first button: a focused icon button opens its tooltip right away.
const focus = () => stage.value?.focus()

defineExpose({ focus })
</script>

<template>
  <div class="relative min-h-0 flex-1">
    <div
      ref="stage"
      tabindex="-1"
      class="absolute inset-0 flex overflow-auto outline-none"
      :class="[isPhone ? 'px-4' : 'p-1', { 'touch-pan-y': isPhone && !isMarking }]"
    >
      <div
        class="relative m-auto shrink-0 overflow-hidden"
        :class="isPhone ? 'rounded-xl' : 'rounded-lg border border-border shadow-2xl'"
        :style="shown ? { width: `${shown.width}px`, height: `${shown.height}px` } : undefined"
      >
        <img
          :key="image.src"
          :src="image.src"
          :alt="image.name"
          draggable="false"
          class="block size-full object-contain select-none"
          @load="emit('load', naturalSizeOf($event))"
        />
        <ChatMarkupCanvas v-if="isMarking && natural" :key="image.src" :natural />
      </div>
    </div>
    <template v-if="canPage && !isPhone && !isMarking">
      <NchIconButton
        :label="t('chat.previous_image')"
        variant="secondary"
        size="icon"
        class="absolute top-1/2 left-2 size-10 -translate-y-1/2 rounded-full shadow-md"
        @click="emit('step', -1)"
      >
        <ChevronLeft class="size-5" aria-hidden="true" />
      </NchIconButton>
      <NchIconButton
        :label="t('chat.next_image')"
        variant="secondary"
        size="icon"
        class="absolute top-1/2 right-2 size-10 -translate-y-1/2 rounded-full shadow-md"
        @click="emit('step', 1)"
      >
        <ChevronRight class="size-5" aria-hidden="true" />
      </NchIconButton>
    </template>
  </div>
</template>
