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
  foldRows,
  isCommentable,
  linesOf,
  type LineRange,
  type ReviewComment,
  type ReviewHunk,
  type ReviewLine,
  type ReviewRow
} from '@/utils/diffReview'

// A file's diff to comment on (Figma "30" look, both line numbers): choose one line or a range
// with the pointer on the numbers or with the arrow keys, Enter writes a comment below it. Long
// unchanged stretches are folded until opened.
const { hunks, comments, label, referenceOf } = defineProps<{
  hunks: ReviewHunk[]
  /** This file's pending comments, shown below the lines they name */
  comments: ReviewComment[]
  label: string
  /** `src/foo.ts:42-45` for a range, `null` when its lines have no numbers */
  referenceOf: (range: LineRange) => string | null
}>()
const emit = defineEmits<{ comment: [range: LineRange, text: string]; remove: [id: string] }>()

const expanded = ref(new Set<number>())
const box = useTemplateRef<HTMLElement>('box')
const formRange = ref<LineRange | null>(null)

const baseId = useId()
const hintId = useId()
const { t } = useI18n()

const allLines = computed(() => linesOf(hunks))
const rows = computed(() => foldRows(allLines.value, expanded.value))
const choosable = computed(() =>
  rows.value.flatMap((row) => (row.kind === 'line' && isCommentable(row) ? [row.index] : []))
)
const selection = useLineSelection(choosable)
const rangeReference = computed(() =>
  selection.range.value ? referenceOf(selection.range.value) : null
)
const cursorId = computed(() =>
  selection.cursor.value === null ? undefined : `${baseId}-${selection.cursor.value}`
)
// The line under the cursor is read with the lines it names: the tint alone says nothing.
const announcement = computed(() => {
  const reference = rangeReference.value
  if (!reference) return ''
  const line = allLines.value.find(
    (row): row is ReviewLine => row.kind === 'line' && row.index === selection.cursor.value
  )
  return t('review.chosen', { reference, text: line?.text.trim() ?? '' })
})
const commentsByEnd = computed(() => {
  const byEnd = new Map<number, ReviewComment[]>()
  for (const comment of comments)
    byEnd.set(comment.range.end, [...(byEnd.get(comment.range.end) ?? []), comment])
  return byEnd
})

const keyOf = (row: ReviewRow, at: number) => {
  if (row.kind === 'line') return row.index
  return row.kind === 'fold' ? `fold-${row.id}` : `gap-${at}`
}
const isChosen = (index: number) => {
  const range = selection.range.value
  return range !== null && index >= range.start && index <= range.end
}
const press = (index: number, event: PointerEvent) => {
  formRange.value = null
  selection.press(index, event)
  // The press keeps focus where it was; the arrow keys go on from the line just chosen.
  box.value?.focus({ preventScroll: true })
}
const openForm = () => {
  if (!rangeReference.value || !selection.range.value) return
  formRange.value = selection.range.value
}
// The form takes the focus with it; the keyboard goes on in the lines.
const closeForm = () => {
  formRange.value = null
  box.value?.focus({ preventScroll: true })
}
const addComment = (text: string) => {
  if (!formRange.value) return
  emit('comment', formRange.value, text)
  closeForm()
  selection.clear()
}
// The fold's button goes with it; the keyboard goes on in the lines it opened.
const expand = (id: number) => {
  expanded.value = new Set([...expanded.value, id])
  box.value?.focus({ preventScroll: true })
}

const STEPS: Record<string, number> = {
  ArrowDown: 1,
  ArrowUp: -1,
  End: Infinity,
  Home: -Infinity
}
const handleKeydown = (event: KeyboardEvent) => {
  // Keys typed into the comment form are the form's own.
  if (event.target !== event.currentTarget) return
  const step = STEPS[event.key]
  if (step !== undefined) {
    event.preventDefault()
    formRange.value = null
    selection.move(step, event.shiftKey)
    return
  }
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

// Another file, or its lines read again: nothing chosen or opened carries over.
watch(
  () => hunks,
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
            :is-chosen="isChosen(row.index)"
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
            v-if="formRange?.end === row.index && rangeReference"
            :reference="rangeReference"
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
