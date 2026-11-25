<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { ChevronsUpDown, MessageSquarePlus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import ReviewCommentCard from '@/components/review/ReviewCommentCard.vue'
import ReviewCommentForm from '@/components/review/ReviewCommentForm.vue'
import ReviewDiffLine from '@/components/review/ReviewDiffLine.vue'
import { useLineSelection } from '@/composables/useLineSelection'
import {
  commentedIndicesOf,
  foldRows,
  isCommentable,
  referenceOf,
  type LineRange,
  type ReviewComment,
  type ReviewRow
} from '@/utils/diffReview'
import { rowsOfHunks, shapeOf, type DiffHunk, type DiffLineRow } from '@/utils/diffRows'

// A file's diff to comment on (Figma "30" look, both line numbers): choose one line or a range
// with the pointer on the numbers or with the arrow keys, Enter writes a comment below it. Long
// unchanged stretches are folded until opened; lines a comment names never are. An open comment
// form stays until it is added or cancelled, whatever is chosen meanwhile.
const { hunks, comments, label, path } = defineProps<{
  hunks: DiffHunk[]
  /** This file's pending comments, shown below the lines they name */
  comments: ReviewComment[]
  label: string
  /** The file as comments name it, `src/foo.ts` */
  path: string
}>()
const emit = defineEmits<{
  comment: [comment: { range: LineRange; reference: string; text: string }]
  remove: [id: string]
}>()

const expanded = ref(new Set<number>())
const box = useTemplateRef<HTMLElement>('box')
const formRange = ref<LineRange | null>(null)
const forms = useTemplateRef<InstanceType<typeof ReviewCommentForm>[]>('form')

const baseId = useId()
const hintId = useId()
const { t } = useI18n()

const allRows = computed(() => rowsOfHunks(hunks))
const lines = computed(() => allRows.value.filter((row): row is DiffLineRow => row.kind === 'line'))
const rows = computed(() => foldRows(allRows.value, expanded.value, commentedIndicesOf(comments)))
const choosable = computed(() =>
  rows.value.flatMap((row) => (row.kind === 'line' && isCommentable(row) ? [row.index] : []))
)
const selection = useLineSelection(choosable)
const rangeReference = computed(() => referenceTextOf(selection.range.value))
const formReference = computed(() => referenceTextOf(formRange.value))
const cursorId = computed(() =>
  selection.cursor.value === null ? undefined : `${baseId}-${selection.cursor.value}`
)
// The line under the cursor is read with the lines it names: the tint alone says nothing.
const announcement = computed(() => {
  const reference = rangeReference.value
  if (!reference) return ''
  const line = lines.value.find((row) => row.index === selection.cursor.value)
  return t('review.chosen', { reference, text: line?.text.trim() ?? '' })
})
const commentsByEnd = computed(() => {
  const byEnd = new Map<number, ReviewComment[]>()
  for (const comment of comments)
    byEnd.set(comment.range.end, [...(byEnd.get(comment.range.end) ?? []), comment])
  return byEnd
})
// Comments on lines this reading of the file no longer has: still pending, so still shown.
const strayComments = computed(() => {
  const shown = new Set(rows.value.flatMap((row) => (row.kind === 'line' ? [row.index] : [])))
  return comments.filter((comment) => !shown.has(comment.range.end))
})

const keyOf = (row: ReviewRow, at: number) => {
  if (row.kind === 'line') return row.index
  return row.kind === 'fold' ? `fold-${row.id}` : `gap-${at}`
}
/** `src/foo.ts:42-45`, marked when only removed lines were chosen; `null` without numbers. */
const referenceTextOf = (range: LineRange | null): string | null => {
  const found = range ? referenceOf(lines.value, range, path) : null
  if (!found) return null
  return found.isOld ? t('review.old_reference', { reference: found.reference }) : found.reference
}
const press = (index: number, event: PointerEvent) => {
  selection.press(index, event)
  // The press keeps focus where it was; the arrow keys go on from the line just chosen.
  box.value?.focus({ preventScroll: true })
}
const openForm = () => {
  // One form at a time: Enter goes back to the one being written instead of dropping its text.
  if (formRange.value) {
    forms.value?.[0]?.focus()
    return
  }
  if (!rangeReference.value || !selection.range.value) return
  formRange.value = selection.range.value
}
// The form takes the focus with it; the keyboard goes on in the lines.
const closeForm = () => {
  formRange.value = null
  box.value?.focus({ preventScroll: true })
}
const addComment = (text: string) => {
  if (!formRange.value || !formReference.value) return
  emit('comment', { range: formRange.value, reference: formReference.value, text })
  closeForm()
  selection.clear()
}
// The fold's button goes with it; the keyboard goes on in the lines it opened.
const expand = (id: number) => {
  expanded.value = new Set([...expanded.value, id])
  box.value?.focus({ preventScroll: true })
}

const handleKeydown = (event: KeyboardEvent) => {
  // Keys typed into the comment form are the form's own.
  if (event.target !== event.currentTarget || selection.handleKey(event)) return
  if (event.key === 'Enter') {
    event.preventDefault()
    openForm()
    return
  }
  // Esc first lets go of the chosen lines; only with none does it close the review.
  if (event.key !== 'Escape' || selection.range.value === null) return
  event.stopPropagation()
  selection.clear()
}

// Lines that moved: nothing chosen or opened carries over. The same diff read again keeps it.
watch(
  () => shapeOf(hunks),
  () => {
    expanded.value = new Set()
    formRange.value = null
    selection.clear()
  }
)
watch(cursorId, async (id) => {
  if (!id) return
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <p :id="hintId" class="sr-only">{{ t('review.diff_hint') }}</p>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
    <div
      ref="box"
      tabindex="0"
      role="group"
      :aria-label="label"
      :aria-describedby="hintId"
      :aria-activedescendant="cursorId"
      class="min-h-0 flex-1 overflow-auto rounded-lg border bg-card py-1.5 font-mono text-meta outline-none focus-visible:ring-2 focus-visible:ring-ring"
      @keydown="handleKeydown"
    >
      <ReviewCommentCard
        v-for="comment in strayComments"
        :key="comment.id"
        :comment
        @remove="emit('remove', comment.id)"
      />
      <template v-for="(row, at) in rows" :key="keyOf(row, at)">
        <div v-if="row.kind === 'gap'" class="px-3 text-muted-foreground" aria-hidden="true">⋯</div>
        <button
          v-else-if="row.kind === 'fold'"
          type="button"
          class="motion-press flex w-full items-center gap-2 bg-muted/50 px-3 py-0.5 font-sans text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          @click="expand(row.id)"
        >
          <ChevronsUpDown class="size-3.5" aria-hidden="true" />
          {{ t('review.unfold', row.lines.length) }}
        </button>
        <template v-else>
          <ReviewDiffLine
            :id="`${baseId}-${row.index}`"
            :line="row"
            :is-chosen="selection.isChosen(row.index)"
            :is-cursor="selection.cursor.value === row.index"
            @press="press(row.index, $event)"
            @sweep="selection.sweep(row.index)"
          />
          <ReviewCommentCard
            v-for="comment in commentsByEnd.get(row.index) ?? []"
            :key="comment.id"
            :comment
            @remove="emit('remove', comment.id)"
          />
          <ReviewCommentForm
            v-if="formRange?.end === row.index && formReference"
            ref="form"
            :reference="formReference"
            @submit="addComment"
            @cancel="closeForm"
          />
          <div
            v-else-if="!formRange && rangeReference && selection.range.value?.end === row.index"
            class="flex px-2 py-1 font-sans"
          >
            <Button size="sm" variant="outline" @click="openForm">
              <MessageSquarePlus class="size-4" aria-hidden="true" />
              {{ t('review.comment_on', { reference: rangeReference }) }}
            </Button>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
