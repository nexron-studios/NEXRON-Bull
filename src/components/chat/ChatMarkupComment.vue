<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { ArrowDown, ArrowUp, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchKbd from '@/components/common/NchKbd.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMarkup } from '@/composables/useMarkup'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { SEND_CHORD, isRemoveKey } from '@/utils/shortcuts'

// Under the desktop preview (Figma "20b"), in the same dialog as the image: the marks' notes and
// the ways out. While marking, each numbered mark has its note here as well as on the image, so
// the text and the spot it is about stay one thing. An attachment's notes from earlier rounds come
// first and can be changed or taken out here. A sent image (`hasComment`) also gets a field
// for what Claude should change, ready while viewing too; an image still in the composer gets
// none, as it is written about next to its chip there. "Ins Eingabefeld" hands it to the
// composer to write on; "Senden" (Ctrl/Cmd+Enter) sends it as a message of its own.
// A long note wraps and grows up to a few lines, then scrolls. The × removes the mark with its
// note; Backspace in a pin's empty note does too, as a pin is nothing without it.
// Past about ten notes the list scrolls instead of squeezing the image, and a new mark's row
// comes into view, since its note is typed on the image and the list would not follow by itself.
const {
  isMarking,
  isApplying,
  hasComment = true
} = defineProps<{ isMarking: boolean; isApplying: boolean; hasComment?: boolean }>()
const emit = defineEmits<{ discard: []; apply: []; send: [] }>()

const { t } = useI18n()
const { labelOf, ariaOf } = useShortcutLabels()
const markup = useMarkup()

const rowLookOf = (id: string) => {
  const stroke = markup.strokes.value.find((mark) => mark.id === id)
  return { color: stroke?.color ?? 'transparent', isPin: stroke?.tool === 'pin' }
}

const rows = computed(() =>
  [...markup.numbers.value].map(([id, number]) => ({
    id,
    number,
    ...rowLookOf(id)
  }))
)

const handleNoteKeydown = (event: KeyboardEvent, row: { id: string; isPin: boolean }) => {
  if (!row.isPin || markup.notes.value[row.id] || !isRemoveKey(event)) return
  event.preventDefault()
  markup.removeMark(row.id)
}
const hasNotes = computed(
  () => markup.earlierNotes.value.length > 0 || (isMarking && rows.value.length > 0)
)

const noteList = useTemplateRef('noteList')
watch(
  () => rows.value.length,
  async (count, previousCount) => {
    if (count <= previousCount) return
    await nextTick()
    noteList.value?.lastElementChild?.scrollIntoView({ block: 'nearest' })
  }
)
</script>

<template>
  <section
    :aria-label="t(hasComment ? 'images.comment_title' : 'images.marks_title')"
    class="flex flex-col gap-2 rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
  >
    <!-- The padding keeps the focus ring of a note inside the scrolling box. -->
    <ol
      v-if="hasNotes"
      ref="noteList"
      :aria-label="t('images.notes_title')"
      class="-m-1 flex max-h-82 flex-col gap-1 overflow-y-auto overscroll-contain p-1"
    >
      <!-- An attachment's notes from earlier rounds: their marks are burnt in, so the number is
           fixed and only the text changes; the × takes the note, not the mark. -->
      <li
        v-for="note in markup.earlierNotes.value"
        :key="`earlier-${note.number}`"
        class="flex items-start gap-2"
      >
        <span
          class="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-meta font-bold text-secondary-foreground ring-1 ring-border"
          aria-hidden="true"
        >
          {{ note.number }}
        </span>
        <Textarea
          :model-value="note.text"
          rows="1"
          :aria-label="`${t('images.note_label')} ${note.number}`"
          :placeholder="t('images.note_placeholder')"
          class="max-h-24 min-h-7 resize-none py-1 text-small"
          @update:model-value="markup.setEarlierNote(note.number, String($event))"
        />
        <NchIconButton
          :label="t('images.remove_note', { n: note.number })"
          size="icon-xs"
          class="mt-1 shrink-0 text-muted-foreground"
          @click="markup.removeEarlierNote(note.number)"
        >
          <X aria-hidden="true" />
        </NchIconButton>
      </li>
      <li v-for="row in isMarking ? rows : []" :key="row.id" class="flex items-start gap-2">
        <span
          class="mt-1 grid size-5 shrink-0 place-items-center rounded-full text-meta font-bold text-stage-foreground ring-1 ring-stage/50 [text-shadow:0_0_2px_rgb(0_0_0/0.6)]"
          :style="{ backgroundColor: row.color }"
          aria-hidden="true"
        >
          {{ row.number }}
        </span>
        <Textarea
          :model-value="markup.notes.value[row.id] ?? ''"
          rows="1"
          :aria-label="`${t('images.note_label')} ${row.number}`"
          :placeholder="t('images.note_placeholder')"
          class="max-h-24 min-h-7 resize-none py-1 text-small"
          @update:model-value="markup.setNote(row.id, String($event))"
          @blur="markup.settleNote(row.id)"
          @keydown="handleNoteKeydown($event, row)"
        />
        <!-- mousedown would blur the note first, and an empty one gives its row up on blur. -->
        <NchIconButton
          :label="t('images.remove_mark', { n: row.number })"
          size="icon-xs"
          class="mt-1 shrink-0 text-muted-foreground"
          @mousedown.prevent
          @click="markup.removeMark(row.id)"
        >
          <X aria-hidden="true" />
        </NchIconButton>
      </li>
    </ol>
    <template v-if="hasComment">
      <Label for="markup-comment" class="sr-only">{{ t('images.comment_title') }}</Label>
      <Textarea
        id="markup-comment"
        v-model="markup.comment.value"
        :placeholder="
          t(hasNotes ? 'images.comment_placeholder_general' : 'images.comment_placeholder')
        "
        aria-describedby="markup-comment-hint"
        class="max-h-28 min-h-13 resize-none text-small"
      />
      <p id="markup-comment-hint" class="sr-only">{{ t('images.comment_hint') }}</p>
    </template>
    <div class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <div v-if="isMarking" class="mr-auto flex items-center gap-2">
        <Checkbox
          id="markup-keep-original"
          v-model="markup.isKeepingOriginal.value"
          :disabled="!markup.strokes.value.length"
        />
        <Label for="markup-keep-original" class="text-small text-secondary-foreground">
          {{ t('images.keep_original') }}
        </Label>
      </div>
      <div class="flex gap-1.5">
        <Button variant="outline" size="sm" @click="emit('discard')">
          {{ t('images.discard') }}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          :disabled="!markup.isDirty.value"
          :aria-busy="isApplying"
          @click="emit('apply')"
        >
          <ArrowDown aria-hidden="true" />
          {{ t('images.apply') }}
        </Button>
        <Button
          size="sm"
          class="bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
          :disabled="!markup.isDirty.value"
          :aria-busy="isApplying"
          :aria-keyshortcuts="ariaOf(SEND_CHORD)"
          @click="emit('send')"
        >
          <ArrowUp aria-hidden="true" />
          {{ t('images.send') }}
          <NchKbd :key-label="labelOf(SEND_CHORD)" is-on-fill />
        </Button>
      </div>
    </div>
  </section>
</template>
