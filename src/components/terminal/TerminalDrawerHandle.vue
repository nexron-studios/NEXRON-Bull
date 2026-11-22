<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useDraggable, useElementSize } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { clampDrawerHeight, MIN_DRAWER_HEIGHT } from '@/utils/terminalEntry'

// The drawer's top edge: drag it or use the arrow keys to give the terminal more or less room.
const height = defineModel<number>('height', { required: true })

/** One arrow key press; with Shift a bigger step */
const KEY_STEP_PX = 16
const SHIFT_KEY_STEP_PX = 64

const isResizing = ref(false)
const handle = useTemplateRef<HTMLElement>('handle')
// The chat column the drawer sits in: the chat above keeps its share of it.
const column = computed(() => handle.value?.parentElement?.parentElement ?? null)
let startY = 0
let startHeight = 0

const { t } = useI18n()
const { height: columnHeight } = useElementSize(column)
useDraggable(handle, {
  preventDefault: true,
  onStart: (_, event) => {
    startY = event.clientY
    startHeight = height.value
    isResizing.value = true
    handle.value?.setPointerCapture(event.pointerId)
  },
  onMove: (_, event) => {
    height.value = clampDrawerHeight(startHeight + startY - event.clientY, columnHeight.value)
  },
  onEnd: () => {
    isResizing.value = false
  }
})

const maxHeight = computed(() => clampDrawerHeight(Number.POSITIVE_INFINITY, columnHeight.value))

const handleKeydown = (event: KeyboardEvent) => {
  const step = event.shiftKey ? SHIFT_KEY_STEP_PX : KEY_STEP_PX
  const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
  if (!direction) return
  event.preventDefault()
  height.value = clampDrawerHeight(height.value + direction * step, columnHeight.value)
}
</script>

<template>
  <div
    ref="handle"
    role="separator"
    tabindex="0"
    aria-orientation="horizontal"
    :aria-label="t('terminal.resize')"
    :aria-valuenow="height"
    :aria-valuemin="MIN_DRAWER_HEIGHT"
    :aria-valuemax="maxHeight"
    class="group/handle absolute inset-x-0 -top-1 z-20 h-2 cursor-row-resize touch-none outline-none"
    @keydown="handleKeydown"
  >
    <span
      class="pointer-events-none absolute inset-x-0 top-[3px] h-0.5 bg-brand opacity-0 transition-opacity duration-150 group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100"
      :class="{ 'opacity-100': isResizing }"
      aria-hidden="true"
    />
  </div>
</template>
