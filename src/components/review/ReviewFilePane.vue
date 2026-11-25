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
import { displayPathOf, hunksOfReview, type LineRange } from '@/utils/diffReview'
import { countsOf, type DiffHunk } from '@/utils/diffRows'

// One file in the review: its header and its lines to comment on. Each file shown is asked for
// again, so the review sees it as it is now; the diff below starts fresh per file.
const { tab, file, chatHunks } = defineProps<{
  tab: ChatTabState
  file: ChangedFile
  /** The chat's own edits of the file, read only when they stand in for git's diff */
  chatHunks: () => DiffHunk[]
}>()
const emit = defineEmits<{ reveal: [] }>()

const SKELETON_LINES = 8

const { t } = useI18n()
const store = useDiffReviewStore()
const { review } = useFileDiff(
  () => ({ machine: tab.machine, cwd: tab.cwd, path: file.path }),
  () => chatHunks()
)

const path = computed(() => displayPathOf(file.path, tab.cwd))
const hunks = computed(() => hunksOfReview(review.value))
// Without lines (binary, too big) the review counts nothing; the chat's counts still hold.
const counts = computed(() =>
  hunks.value.length ? countsOf(hunks.value) : { added: file.added, removed: file.removed }
)
const emptyHintKey = computed(() =>
  review.value.kind === 'chat' && review.value.reason === 'unchanged'
    ? 'review.nothing_hint_unchanged'
    : 'review.nothing_hint'
)
const comments = computed(() => store.commentsOfFile(tab.id, file.key))

// A comment remembers line positions of the diff it was written on; read again after
// the file changed, it may sit a few lines off. Its reference text stays right either way.
const addComment = ({
  range,
  reference,
  text
}: {
  range: LineRange
  reference: string
  text: string
}) => store.add(tab.id, { id: crypto.randomUUID(), fileKey: file.key, reference, range, text })
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col gap-2" :aria-label="path">
    <ReviewFileHeader :name="file.name" :path :counts :review @reveal="emit('reveal')">
      <slot name="actions" />
    </ReviewFileHeader>
    <div
      v-if="review.kind === 'loading'"
      class="flex flex-col gap-1.5 rounded-lg border bg-card p-3"
      aria-busy="true"
    >
      <Skeleton v-for="row in SKELETON_LINES" :key="row" class="h-3.5 w-full" />
    </div>
    <NchEmpty
      v-else-if="review.kind === 'binary'"
      :icon="FileQuestion"
      :title="t('review.binary_title')"
      :hint="t('review.binary_hint')"
      size="sm"
    />
    <NchEmpty
      v-else-if="!hunks.length"
      :icon="FileQuestion"
      :title="t('review.nothing_title')"
      :hint="t(emptyHintKey)"
      size="sm"
    />
    <ReviewDiff
      v-else
      :key="file.key"
      class="motion-fade-in"
      :hunks
      :comments
      :path
      :label="t('review.diff_label', { path })"
      @comment="addComment"
      @remove="store.remove(tab.id, $event)"
    />
  </section>
</template>
