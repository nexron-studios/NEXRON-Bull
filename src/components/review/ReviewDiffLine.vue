<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { DIFF_MARK_CLASS, DIFF_ROW_CLASS, type DiffLineRow } from '@/utils/diffRows'

// One line of the review: old and new number, mark, text. The number column is the handle for
// choosing lines with the pointer (click, Shift+click, drag); the text stays selectable to copy.
// The keyboard path lives on the diff around it, so the handle is no tab stop of its own.
const {
  id,
  line,
  isChosen = false,
  isCursor = false
} = defineProps<{
  id: string
  line: DiffLineRow
  isChosen?: boolean
  isCursor?: boolean
}>()
const emit = defineEmits<{ press: [event: PointerEvent]; sweep: [event: PointerEvent] }>()

/** Read before the line, since the tint alone says nothing to a screen reader */
const SIGN_KEY = {
  '+': 'review.line_added',
  '-': 'review.line_removed',
  ' ': 'review.line_kept'
} as const

const { t } = useI18n()
</script>

<template>
  <div
    :id
    class="flex"
    :class="[
      DIFF_ROW_CLASS[line.sign],
      { 'bg-brand/15!': isChosen, 'ring-1 ring-ring ring-inset': isCursor }
    ]"
  >
    <span
      class="flex shrink-0 cursor-pointer gap-1 px-1 text-right text-muted-foreground tabular-nums select-none hover:bg-brand/20"
      aria-hidden="true"
      @pointerdown="emit('press', $event)"
      @pointerenter="emit('sweep', $event)"
    >
      <span class="w-9">{{ line.old ?? '' }}</span>
      <span class="w-9">{{ line.new ?? '' }}</span>
    </span>
    <span class="sr-only">{{ t(SIGN_KEY[line.sign], { line: line.new ?? line.old ?? '' }) }}</span>
    <span
      class="w-4 shrink-0 text-center select-none"
      :class="DIFF_MARK_CLASS[line.sign]"
      aria-hidden="true"
      >{{ line.sign.trim() }}</span
    >
    <span class="min-w-0 flex-1 pr-3 wrap-anywhere whitespace-pre-wrap">{{
      line.text || ' '
    }}</span>
  </div>
</template>
