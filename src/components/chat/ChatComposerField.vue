<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import ChatTextPieces from '@/components/chat/ChatTextPieces.vue'
import { mentionRangesOf } from '@/utils/fileMentions'
import type { TextSelection } from '@/utils/imageRefs'
import { textPiecesOf, type Highlight } from '@/utils/textPieces'

// The composer's text field. A textarea cannot style part of its text, so mentioned files and
// image references are drawn by a copy of the text behind it, laid out the same (Figma 32:
// `@ChatComposer.vue`). Both always keep a scrollbar's room, so a long draft wraps alike in both.
// A mention only needs a tint; an image reference becomes a chip, so while one is there the copy
// shows the text and the textarea above keeps only caret and selection.
// Both wrap, so neither ever scrolls sideways: `overflow-x-hidden` says so, because the system
// WebView (WebKit regression 311766@main, fixed upstream in 312927@main) sometimes gave the empty
// field a horizontal scrollbar anyway.
const {
  placeholder,
  label,
  known,
  highlights = [],
  isShell = false,
  menuId = null,
  activeOptionId = null
} = defineProps<{
  placeholder: string
  label: string
  known: ReadonlySet<string>
  /** Image references, found by the composer, which knows the attachments */
  highlights?: readonly Highlight[]
  isShell?: boolean
  /** The menu's listbox while it is open */
  menuId?: string | null
  activeOptionId?: string | null
}>()
const emit = defineEmits<{
  keydown: [event: KeyboardEvent]
  paste: [event: ClipboardEvent]
  caret: [at: number]
}>()

const text = defineModel<string>({ required: true })

const field = useTemplateRef<HTMLTextAreaElement>('field')
const mirror = useTemplateRef<HTMLElement>('mirror')

// Until the field was focused once, its selection says nothing about where the user writes.
const hasCaret = ref(false)

const pieces = computed(() =>
  isShell ? [] : textPiecesOf(text.value, [...mentionRangesOf(text.value, known), ...highlights])
)
const hasHighlight = computed(() => pieces.value.some((piece) => piece.mark))
const hasChip = computed(() => pieces.value.some((piece) => piece.mark?.kind === 'image'))

const reportCaret = () => emit('caret', field.value?.selectionStart ?? text.value.length)
// Not v-model: it holds the text back while a dead key or an IME composes, and with a chip the
// mirror is the only visible text, so the composing letters would not show.
const handleInput = (event: Event) => {
  text.value = (event.target as HTMLTextAreaElement).value
  reportCaret()
}
const handleFocus = () => {
  hasCaret.value = true
  reportCaret()
}
const syncScroll = () => {
  if (mirror.value && field.value) mirror.value.scrollTop = field.value.scrollTop
}
const focus = () => field.value?.focus()
const isFocused = () => !!field.value && document.activeElement === field.value

/** Where the user last wrote, also after the field lost focus; `null` before the first focus. */
const selection = (): TextSelection | null =>
  field.value && hasCaret.value
    ? { start: field.value.selectionStart, end: field.value.selectionEnd }
    : null

/** After the text was replaced: caret there, field focused, the menu told. */
const setCaret = async (at: number) => {
  await nextTick()
  field.value?.focus()
  field.value?.setSelectionRange(at, at)
  emit('caret', at)
}

// A mirror that just appeared, or text that changed the height, starts at the field's scroll.
watch(pieces, syncScroll, { flush: 'post' })

defineExpose({ focus, isFocused, selection, setCaret, field })
</script>

<template>
  <div class="relative grid">
    <div
      v-if="hasHighlight"
      ref="mirror"
      aria-hidden="true"
      class="pointer-events-none col-start-1 row-start-1 max-h-60 overflow-x-hidden overflow-y-scroll px-4 pt-3 pb-1 text-body break-words whitespace-pre-wrap [&::-webkit-scrollbar-thumb]:bg-transparent"
      :class="hasChip ? 'text-foreground' : 'text-transparent'"
    >
      <ChatTextPieces :pieces />
      <!-- A trailing line break only counts in the textarea; this keeps the last line in the copy. -->
      <template v-if="text.endsWith('\n')">&#8203;</template>
    </div>
    <label for="composer" class="sr-only">{{ label }}</label>
    <textarea
      id="composer"
      ref="field"
      :value="text"
      :placeholder
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="!!menuId"
      :aria-controls="menuId ?? undefined"
      :aria-activedescendant="activeOptionId ?? undefined"
      rows="1"
      class="col-start-1 row-start-1 field-sizing-content max-h-60 min-h-11 w-full resize-none overflow-x-hidden overflow-y-scroll bg-transparent px-4 pt-3 pb-1 text-body outline-none placeholder:text-muted-foreground"
      :class="[
        isShell && 'font-mono',
        hasChip &&
          'text-transparent caret-foreground selection:bg-brand/30 selection:text-transparent'
      ]"
      @keydown="emit('keydown', $event)"
      @paste="emit('paste', $event)"
      @input="handleInput"
      @click="reportCaret"
      @keyup="reportCaret"
      @focus="handleFocus"
      @scroll="syncScroll"
    />
  </div>
</template>
