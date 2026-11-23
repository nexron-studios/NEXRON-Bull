<script setup lang="ts">
import { computed } from 'vue'
import { FileQuestion } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchEmpty from '@/components/common/NchEmpty.vue'
import { Skeleton } from '@/components/ui/skeleton'
import ReviewDiff from '@/components/review/ReviewDiff.vue'
import ReviewFileHeader from '@/components/review/ReviewFileHeader.vue'
import { useFileDiff } from '@/composables/useFileDiff'
import { useDiffReviewStore } from '@/stores/diffReview'
import type { ChangedFile } from '@/utils/changedFiles'
import type { ChatTabState } from '@/utils/chatTab'
import {
  countsOf,
  displayPathOf,
  lineSpanOf,
  linesOf,
  type LineRange,
  type ReviewLine
} from '@/utils/diffReview'

// One file in the review: its header and its lines to comment on. Mounted per file, so every
// opening asks the machine again for the file as it is now.
const { tab, file } = defineProps<{ tab: ChatTabState; file: ChangedFile }>()
const emit = defineEmits<{ reveal: [] }>()

const SKELETON_LINES = 8

const { t } = useI18n()
const store = useDiffReviewStore()
const { review } = useFileDiff(
  () => ({ machine: tab.machine, cwd: tab.cwd, path: file.path }),
  () => file.hunks
)

const path = computed(() => displayPathOf(file.path, tab.cwd))
const lines = computed(() =>
  linesOf(review.value.hunks).filter((row): row is ReviewLine => row.kind === 'line')
)
const counts = computed(() => countsOf(lines.value))
const comments = computed(() =>
  store.commentsOf(tab.id).filter((comment) => comment.fileKey === file.key)
)

const referenceOf = (range: LineRange): string | null => {
  const span = lineSpanOf(lines.value, range)
  if (!span) return null
  const reference = `${path.value}:${span.span}`
  return span.isOld ? t('review.old_reference', { reference }) : reference
}
// A comment remembers line positions of the diff it was written on; read again after
// the file changed, it may sit a few lines off. Its reference text stays right either way.
const addComment = (range: LineRange, text: string) => {
  const reference = referenceOf(range)
  if (!reference) return
  store.add(tab.id, { id: crypto.randomUUID(), fileKey: file.key, reference, range, text })
}
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col gap-2" :aria-label="path">
    <ReviewFileHeader
      :name="file.name"
      :path
      :counts
      :source="review.source"
      :status="review.status"
      :is-truncated="review.isTruncated"
      @reveal="emit('reveal')"
    >
      <slot name="actions" />
    </ReviewFileHeader>
    <div
      v-if="review.source === 'loading'"
      class="flex flex-col gap-1.5 rounded-lg border bg-card p-3"
      aria-busy="true"
    >
      <Skeleton v-for="row in SKELETON_LINES" :key="row" class="h-3.5 w-full" />
    </div>
    <NchEmpty
      v-else-if="review.source === 'binary' || !lines.length"
      :icon="FileQuestion"
      :title="t(review.source === 'binary' ? 'review.binary_title' : 'review.nothing_title')"
      :hint="t(review.source === 'binary' ? 'review.binary_hint' : 'review.nothing_hint')"
      size="sm"
    />
    <ReviewDiff
      v-else
      class="motion-fade-in"
      :hunks="review.hunks"
      :comments
      :label="t('review.diff_label', { path })"
      :reference-of="referenceOf"
      @comment="addComment"
      @remove="store.remove(tab.id, $event)"
    />
  </section>
</template>
