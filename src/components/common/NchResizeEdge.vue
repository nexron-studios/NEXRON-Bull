<script setup lang="ts">
import { onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { useDraggable } from '@vueuse/core'

// A vertical edge between two columns: its line, the width bubble while dragging and the pointer
// handling. The owner turns the pointer's x into a width and handles keys and double clicks, which
// fall through onto the separator.
const {
  label,
  valueNow,
  valueMin,
  valueMax,
  hint,
  hintSide = 'left'
} = defineProps<{
  label: string
  valueNow: number
  valueMin: number
  valueMax: number
  hint: string
  /** The side of the edge the bubble sits on, the one with room for it */
  hintSide?: 'left' | 'right'
}>()
// `move` only fires once the pointer left the threshold, so `start` alone is no resize yet.
const emit = defineEmits<{
  start: [x: number]
  move: [x: number]
  end: []
}>()

/** A shaky click or a double click on the edge must not resize anything. */
const DRAG_THRESHOLD_PX = 4

const isResizing = ref(false)
const handle = useTemplateRef<HTMLElement>('handle')
let isPressed = false
let startX = 0

// A drag ends once: on release, when the system cancels the pointer (useDraggable only listens
// for pointerup) or when the edge disappears mid-drag, so the last width is still stored.
const finish = () => {
  if (!isPressed) return
  isPressed = false
  isResizing.value = false
  emit('end')
}

useDraggable(handle, {
  preventDefault: true,
  // Capture keeps the moves coming while the pointer is over the chat or outside the window.
  onStart: (_, event) => {
    isPressed = true
    startX = event.clientX
    handle.value?.setPointerCapture(event.pointerId)
    emit('start', event.clientX)
  },
  onMove: (_, event) => {
    if (!isPressed) return
    if (!isResizing.value && Math.abs(event.clientX - startX) < DRAG_THRESHOLD_PX) return
    isResizing.value = true
    emit('move', event.clientX)
  },
  onEnd: finish
})

onBeforeUnmount(finish)
</script>

<template>
  <div
    ref="handle"
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuenow="valueNow"
    :aria-valuemin="valueMin"
    :aria-valuemax="valueMax"
    :aria-valuetext="hint"
    class="group/handle absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none outline-none"
    @lostpointercapture="finish"
  >
    <span
      class="pointer-events-none absolute inset-y-0 left-[3px] w-0.5 bg-brand opacity-0 transition-opacity duration-150 group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100"
      :class="{ 'opacity-100': isResizing }"
      aria-hidden="true"
    />
    <span
      v-if="isResizing"
      class="pointer-events-none absolute top-1/2 rounded-md border border-border bg-popover px-1.5 py-0.5 font-mono text-meta whitespace-nowrap text-popover-foreground shadow-sm"
      :class="hintSide === 'left' ? 'right-3' : 'left-3'"
      aria-hidden="true"
      >{{ hint }}</span
    >
  </div>
</template>
