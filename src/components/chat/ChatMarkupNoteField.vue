<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Point, Size } from '@/utils/markup'
import { historyStepOf, isRemoveKey } from '@/utils/shortcuts'

// A small field on the image: the note of a mark beside its number, or a word being written into
// the image right where it will be painted. Enter or leaving it is done; Esc puts back what was
// there when it opened and stays inside this field, so the preview behind it does not close.
// Undo and redo on an empty field go to the drawing, so they still work right after a stroke.
// A note wraps and grows downwards (then scrolls) instead of hiding what does not fit in one line;
// Shift+Enter starts a new line. A word for the image stays one line, as it is painted.
// The × beside a note removes its mark; so does Backspace in the empty note of a pin, which is
// nothing without its note.
const {
  id,
  natural,
  at,
  color,
  label,
  placeholder,
  variant = 'note',
  isFocused = true,
  removeLabel = '',
  canRemoveWhenEmpty = false
} = defineProps<{
  /** Named in every event, so a late blur of this field never ends the next one */
  id: string
  natural: Size
  at: Point
  /** The mark's colour, as the dot in front of a note */
  color: string
  label: string
  placeholder: string
  variant?: 'note' | 'text'
  /** Takes the keyboard on opening */
  isFocused?: boolean
  /** The ×'s label; a note only */
  removeLabel?: string
  /** Backspace or Delete in the empty field removes the mark */
  canRemoveWhenEmpty?: boolean
}>()
const emit = defineEmits<{
  done: [id: string]
  cancel: [id: string]
  history: [action: 'undo' | 'redo']
  remove: [id: string]
}>()
const text = defineModel<string>({ required: true })

/**
 * A note sits right of its number, its first line centred on it, and grows downwards. Past these
 * fractions of the image it opens to the left, upwards or downwards instead, so it stays inside.
 */
const FLIP_X = 0.6
const EDGE_Y = 0.12

const field = ref<{ $el: HTMLElement } | null>(null)
// Enter ends the field and unmounting it blurs, which would end it a second time.
const isDone = ref(false)
const opened = text.value

const position = computed(() => {
  const x = at.x / natural.width
  const y = at.y / natural.height
  const style = { left: `${x * 100}%`, top: `${y * 100}%` }
  // The typed word starts where the click was, as it will be painted there.
  if (variant === 'text') return { style, class: '-translate-x-1.5 -translate-y-2.5' }
  return {
    style,
    class: [
      x > FLIP_X ? '-ml-3 -translate-x-full' : 'ml-3',
      y > 1 - EDGE_Y ? '-translate-y-full' : y < EDGE_Y ? '' : '-translate-y-4.5'
    ]
  }
})

const finish = (outcome: 'done' | 'cancel') => {
  if (isDone.value) return
  isDone.value = true
  if (outcome === 'done') emit('done', id)
  else emit('cancel', id)
}

const remove = () => {
  isDone.value = true
  emit('remove', id)
}

const handleKeydown = (event: KeyboardEvent) => {
  const action = historyStepOf(event)
  if (canRemoveWhenEmpty && !text.value && isRemoveKey(event)) {
    event.preventDefault()
    remove()
  } else if (action && !text.value) {
    event.preventDefault()
    emit('history', action)
  } else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    finish('done')
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    text.value = opened
    finish('cancel')
  }
}

onMounted(() => {
  if (isFocused) field.value?.$el.focus()
})
</script>

<template>
  <div
    class="absolute z-10 flex gap-2 rounded-lg border border-border bg-popover py-1 pr-1 text-popover-foreground shadow-xl"
    :class="[
      position.class,
      variant === 'text' ? 'w-44 items-center pl-0' : 'w-64 items-start pl-2'
    ]"
    :style="position.style"
    @pointerdown.stop
  >
    <template v-if="variant === 'note'">
      <span
        class="mt-2 size-3 shrink-0 rounded-full ring-1 ring-border"
        :style="{ backgroundColor: color }"
        aria-hidden="true"
      />
      <Textarea
        ref="field"
        v-model="text"
        rows="1"
        :aria-label="label"
        :placeholder
        class="max-h-32 min-h-7 resize-none rounded-none border-0 bg-transparent px-1 py-1 text-small focus-visible:ring-0"
        @keydown="handleKeydown"
        @blur="finish('done')"
      />
      <!-- mousedown would blur the note first, which closes the field before the click lands. -->
      <NchIconButton
        :label="removeLabel"
        size="icon-xs"
        class="mt-0.5 shrink-0 text-muted-foreground"
        @mousedown.prevent
        @click="remove"
      >
        <X aria-hidden="true" />
      </NchIconButton>
    </template>
    <Input
      v-else
      ref="field"
      v-model="text"
      :aria-label="label"
      :placeholder
      class="h-7 border-0 bg-transparent px-1 text-small focus-visible:ring-0"
      @keydown="handleKeydown"
      @blur="finish('done')"
    />
  </div>
</template>
