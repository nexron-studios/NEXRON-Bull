<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NchResizeEdge from '@/components/common/NchResizeEdge.vue'
import {
  RAIL_WIDTH,
  panelWidthIn,
  sizeAfterKey,
  sizeAtPointer,
  type SidebarSize
} from '@/utils/sidebarLayout'

// The sidebar's right edge: drag or arrow keys change its width, a double click folds it away.
const { size, windowWidth } = defineProps<{ size: SidebarSize; windowWidth: number }>()
// `preview` follows the pointer, `resize` stores the result once, on release or per key.
const emit = defineEmits<{
  preview: [size: SidebarSize]
  resize: [size: SidebarSize]
  toggle: []
}>()

// Snapping to full width mid-drag keeps the width the drag started from, for the way back.
let startWidth = size.width
let latest: SidebarSize | null = null

const { t } = useI18n()

const shownWidth = computed(() => {
  if (size.layout === 'rail') return RAIL_WIDTH
  if (size.layout === 'full') return windowWidth
  return panelWidthIn(size.width, windowWidth)
})
const hint = computed(() => {
  switch (size.layout) {
    case 'rail':
      return t('sidebar.fold_hint')
    case 'full':
      return t('sidebar.full_width')
    case 'panel':
      return t('sidebar.width_px', { width: shownWidth.value })
    default: {
      const unhandled: never = size.layout
      throw new Error(`Unhandled sidebar layout: ${unhandled}`)
    }
  }
})

const handleStart = () => {
  startWidth = size.width
  latest = null
}
// The sidebar starts at the window's left edge, so the pointer's x is its width.
const handleMove = (x: number) => {
  latest = sizeAtPointer(x, windowWidth, startWidth)
  emit('preview', latest)
}
const handleEnd = () => {
  if (latest) emit('resize', latest)
  latest = null
}
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('toggle')
    return
  }
  const next = sizeAfterKey(event.key, event.shiftKey, size, windowWidth)
  if (!next) return
  event.preventDefault()
  emit('resize', next)
}
</script>

<template>
  <NchResizeEdge
    :label="t('sidebar.resize')"
    :value-now="shownWidth"
    :value-min="RAIL_WIDTH"
    :value-max="windowWidth"
    :hint
    :hint-side="size.layout === 'full' ? 'left' : 'right'"
    :class="size.layout === 'full' ? 'right-0' : '-right-1'"
    @start="handleStart"
    @move="handleMove"
    @end="handleEnd"
    @dblclick="emit('toggle')"
    @keydown="handleKeydown"
  />
</template>
