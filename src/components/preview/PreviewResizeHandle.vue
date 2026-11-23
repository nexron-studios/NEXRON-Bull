<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NchResizeEdge from '@/components/common/NchResizeEdge.vue'
import {
  PREVIEW_MIN_WIDTH,
  previewSizeAtDrag,
  previewWidthAfterKey,
  type PreviewSize
} from '@/utils/previewPane'

// The preview's left edge, like the info panel's: drag or arrow keys change its width, dragged
// far right or Enter shuts it, a double click resets the width.
const {
  width,
  maxWidth,
  isClosing = false
} = defineProps<{ width: number; maxWidth: number; isClosing?: boolean }>()
const emit = defineEmits<{
  preview: [size: PreviewSize]
  resize: [size: PreviewSize]
  reset: []
}>()

let startX = 0
let startWidth = width
let latest: PreviewSize | null = null

const { t } = useI18n()

const hint = computed(() => (isClosing ? t('panel.close_hint') : t('panel.width_px', { width })))

const handleStart = (x: number) => {
  startX = x
  startWidth = width
  latest = null
}
const handleMove = (x: number) => {
  latest = previewSizeAtDrag(startWidth + startX - x, maxWidth)
  emit('preview', latest)
}
const handleEnd = () => {
  if (latest) emit('resize', latest)
  latest = null
}
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('resize', { isOpen: false })
    return
  }
  const next = previewWidthAfterKey(event.key, event.shiftKey, width, maxWidth)
  if (next === null) return
  event.preventDefault()
  emit('resize', { isOpen: true, width: next })
}
</script>

<template>
  <NchResizeEdge
    :label="t('preview.resize')"
    :value-now="width"
    :value-min="PREVIEW_MIN_WIDTH"
    :value-max="maxWidth"
    :hint
    hint-side="left"
    class="left-0"
    @start="handleStart"
    @move="handleMove"
    @end="handleEnd"
    @dblclick="emit('reset')"
    @keydown="handleKeydown"
  />
</template>
