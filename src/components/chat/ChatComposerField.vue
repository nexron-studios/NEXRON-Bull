<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue'
import { mentionPiecesOf } from '@/utils/fileMentions'

// The composer's text field. A textarea cannot style part of its text, so mentioned files are
// tinted by a copy of the text behind it, laid out the same (Figma 32: `@ChatComposer.vue`).
const {
  placeholder,
  label,
  known,
  isShell = false,
  menuId = null,
  activeOptionId = null
} = defineProps<{
  placeholder: string
  label: string
  known: ReadonlySet<string>
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

const pieces = computed(() => (isShell ? [] : mentionPiecesOf(text.value, known)))
const hasMention = computed(() => pieces.value.some((piece) => piece.isMention))

const reportCaret = () => emit('caret', field.value?.selectionStart ?? text.value.length)
const syncScroll = () => {
  if (mirror.value && field.value) mirror.value.scrollTop = field.value.scrollTop
}
const focus = () => field.value?.focus()

/** After the text was replaced: caret there, field focused, the menu told. */
const setCaret = async (at: number) => {
  await nextTick()
  field.value?.focus()
  field.value?.setSelectionRange(at, at)
  emit('caret', at)
}

defineExpose({ focus, setCaret, field })
</script>

<template>
  <div class="relative grid">
    <div
      v-if="hasMention"
      ref="mirror"
      aria-hidden="true"
      class="pointer-events-none col-start-1 row-start-1 max-h-60 overflow-hidden px-4 pt-3 pb-1 text-body break-words whitespace-pre-wrap text-transparent"
    >
      <template v-for="(piece, index) in pieces" :key="index">
        <span v-if="piece.isMention" class="rounded-sm bg-brand/25">{{ piece.text }}</span>
        <template v-else>{{ piece.text }}</template>
      </template>
    </div>
    <label for="composer" class="sr-only">{{ label }}</label>
    <textarea
      id="composer"
      ref="field"
      v-model="text"
      :placeholder
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="!!menuId"
      :aria-controls="menuId ?? undefined"
      :aria-activedescendant="activeOptionId ?? undefined"
      rows="1"
      class="col-start-1 row-start-1 field-sizing-content max-h-60 min-h-11 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-body outline-none placeholder:text-muted-foreground"
      :class="isShell && 'font-mono'"
      @keydown="emit('keydown', $event)"
      @paste="emit('paste', $event)"
      @input="reportCaret"
      @click="reportCaret"
      @keyup="reportCaret"
      @focus="reportCaret"
      @scroll="syncScroll"
    />
  </div>
</template>
