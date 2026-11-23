<script setup lang="ts">
import { GitCompare, Info, MessageSquareText } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import type { FileStatus } from '@/types/agentd.type'
import type { ReviewSource } from '@/utils/diffReview'

// Above a file's diff: name and path, new or deleted, the lines added and removed, where the lines
// come from, and the way back to the change's card in the chat. The slot holds the step to the
// next file.
defineProps<{
  name: string
  path: string
  counts: { added: number; removed: number }
  source: ReviewSource
  status: FileStatus | null
  isTruncated: boolean
}>()
const emit = defineEmits<{ reveal: [] }>()

/** Said under the name; git's own answer needs no word, a fallback says why it came. */
const NOTE_KEY: Record<ReviewSource, string | null> = {
  git: null,
  binary: null,
  loading: null,
  no_repo: 'review.source.no_repo',
  unchanged: 'review.source.unchanged',
  ignored: 'review.source.ignored',
  failed: 'review.source.failed'
}
/** Only a file that is new or gone gets a word; a changed one is what the review is about. */
const STATUS_KEY: Record<FileStatus, string | null> = {
  added: 'review.status.added',
  untracked: 'review.status.added',
  deleted: 'review.status.deleted',
  modified: null,
  unchanged: null,
  ignored: null
}

const { t } = useI18n()
</script>

<template>
  <header class="flex flex-col gap-1.5">
    <!-- Two groups that sit in one row and wrap on a narrow sheet, the steps to the right. -->
    <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <div class="flex min-w-0 flex-1 basis-64 items-center gap-2">
        <GitCompare class="size-4 shrink-0 text-act-change" aria-hidden="true" />
        <h3 class="min-w-0 shrink truncate text-body font-semibold">{{ name }}</h3>
        <span
          v-if="status && STATUS_KEY[status]"
          class="shrink-0 rounded-full bg-muted px-1.5 text-meta text-muted-foreground"
          >{{ t(STATUS_KEY[status] ?? '') }}</span
        >
        <span class="min-w-0 flex-1 truncate font-mono text-meta text-muted-foreground">{{
          path
        }}</span>
        <span class="sr-only">{{ t('chat.diff_counts', counts) }}</span>
        <span class="flex shrink-0 gap-1.5 text-small tabular-nums" aria-hidden="true">
          <span class="text-good">+{{ counts.added }}</span>
          <span class="text-critical">−{{ counts.removed }}</span>
        </span>
      </div>
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" @click="emit('reveal')">
          <MessageSquareText class="size-4" aria-hidden="true" />
          {{ t('review.show_in_chat') }}
        </Button>
        <slot />
      </div>
    </div>
    <p
      v-if="NOTE_KEY[source] || isTruncated"
      class="flex items-center gap-1.5 text-meta text-muted-foreground"
    >
      <Info class="size-3.5 shrink-0" aria-hidden="true" />
      {{ isTruncated ? t('review.truncated') : t(NOTE_KEY[source] ?? '') }}
    </p>
  </header>
</template>
