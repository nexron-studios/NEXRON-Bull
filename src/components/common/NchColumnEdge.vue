<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NchResizeEdge from '@/components/common/NchResizeEdge.vue'
import { columnSizeAtDrag, columnWidthAfterKey, type ColumnSize } from '@/utils/sideColumn'

// The left edge of a column right of the chat: drag or arrow keys change its width, dragged far
// right or Enter shuts the column like its toolbar button, a double click resets the width.
const {
  label,
  width,
  minWidth,
  maxWidth,
  isClosing = false
} = defineProps<{
  label: string
  width: number
  minWidth: number
  maxWidth: number
  /** The drag would shut the column on release */
  isClosing?: boolean
}>()
// `preview` follows the pointer, `resize` stores the result once, on release or per key.
const emit = defineEmits<{
  preview: [size: ColumnSize]
  resize: [size: ColumnSize]
  reset: []
  /** Enter shut the column; the owner moves the focus, the edge is gone with it */
  close: []
}>()

let startX = 0
let startWidth = width
let latest: ColumnSize | null = null

const { t } = useI18n()

const hint = computed(() =>
  isClosing ? t('side_column.close_hint') : t('side_column.width_px', { width })
)

const handleStart = (x: number) => {
  startX = x
  startWidth = width
  latest = null
}
// The column grows to the left: moving the pointer left by some pixels widens it by as many.
const handleMove = (x: number) => {
  latest = columnSizeAtDrag(startWidth + startX - x, minWidth, maxWidth)
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
  const next = columnWidthAfterKey(event.key, event.shiftKey, width, minWidth, maxWidth)
  if (next === null) return
  event.preventDefault()
  emit('resize', { isOpen: true, width: next })
}
</script>

<template>
  <!-- Inside the column, not across its border: the chat's scrollbar ends right at the border. -->
  <NchResizeEdge
    :label
    :value-now="width"
    :value-min="minWidth"
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
