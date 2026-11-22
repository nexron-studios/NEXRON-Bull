<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NchResizeEdge from '@/components/common/NchResizeEdge.vue'
import {
  INFO_PANEL_MIN_WIDTH,
  infoPanelSizeAtDrag,
  infoPanelWidthAfterKey,
  type InfoPanelSize
} from '@/utils/infoPanel'

// The info panel's left edge: drag or arrow keys change its width, dragged far right or Enter
// shuts the panel like the toolbar button, a double click resets the width.
const {
  width,
  maxWidth,
  isClosing = false
} = defineProps<{
  width: number
  maxWidth: number
  /** The drag would shut the panel on release */
  isClosing?: boolean
}>()
// `preview` follows the pointer, `resize` stores the result once, on release or per key.
const emit = defineEmits<{
  preview: [size: InfoPanelSize]
  resize: [size: InfoPanelSize]
  reset: []
  /** Enter shut the panel; the owner moves the focus, the edge is gone with it */
  close: []
}>()

let startX = 0
let startWidth = width
let latest: InfoPanelSize | null = null

const { t } = useI18n()

const hint = computed(() => (isClosing ? t('panel.close_hint') : t('panel.width_px', { width })))

const handleStart = (x: number) => {
  startX = x
  startWidth = width
  latest = null
}
// The panel grows to the left: moving the pointer left by some pixels widens it by as many.
const handleMove = (x: number) => {
  latest = infoPanelSizeAtDrag(startWidth + startX - x, maxWidth)
  emit('preview', latest)
}
const handleEnd = () => {
  if (latest) emit('resize', latest)
  latest = null
}
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('close')
    return
  }
  const next = infoPanelWidthAfterKey(event.key, event.shiftKey, width, maxWidth)
  if (next === null) return
  event.preventDefault()
  emit('resize', { isOpen: true, width: next })
}
</script>

<template>
  <!-- Inside the panel, not across its border: the chat's scrollbar ends right at the border. -->
  <NchResizeEdge
    :label="t('panel.resize')"
    :value-now="width"
    :value-min="INFO_PANEL_MIN_WIDTH"
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
