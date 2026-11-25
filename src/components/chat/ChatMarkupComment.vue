<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMarkup } from '@/composables/useMarkup'
import { isRemoveKey } from '@/utils/shortcuts'

// Under the desktop preview (Figma "20b"): what Claude should change, and the way into the
// composer, in the same dialog as the image. Ready while viewing too; marking only adds the tools.
// While marking, each numbered mark has its note here as well as on the image, so the text and
// the spot it is about stay one thing; the field below is then for anything else. Nothing is sent
// from here. A long note wraps and grows up to a few lines, then scrolls. The × removes the mark
// with its note; Backspace in a pin's empty note does too, as a pin is nothing without it.
const { isMarking, isApplying } = defineProps<{ isMarking: boolean; isApplying: boolean }>()
const emit = defineEmits<{ discard: []; apply: [] }>()

const { t } = useI18n()
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
const hasNotes = computed(() => isMarking && rows.value.length > 0)
</script>

<template>
  <section
    aria-labelledby="markup-comment-title"
    class="flex flex-col gap-2 rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
  >
    <Label id="markup-comment-title" for="markup-comment" class="sr-only">
      {{ t('images.comment_title') }}
    </Label>
    <ol v-if="hasNotes" :aria-label="t('images.notes_title')" class="flex flex-col gap-1">
      <li v-for="row in rows" :key="row.id" class="flex items-start gap-2">
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
          size="sm"
          class="bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
          :disabled="!markup.isDirty.value"
          :aria-busy="isApplying"
          @click="emit('apply')"
        >
          <ArrowDown aria-hidden="true" />
          {{ t('images.apply') }}
        </Button>
      </div>
    </div>
  </section>
</template>
