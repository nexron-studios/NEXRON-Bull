<script setup lang="ts">
import { MessageSquare } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { ChangedFile } from '@/utils/changedFiles'

// The changed files beside the diff, the one shown marked; the panel's counts, plus how many
// comments wait on each.
defineProps<{
  files: ChangedFile[]
  currentKey: string | null
  commentCounts: ReadonlyMap<string, number>
}>()
const emit = defineEmits<{ pick: [key: string] }>()

const { t } = useI18n()
</script>

<template>
  <nav class="flex min-h-0 flex-col gap-1 overflow-y-auto p-0.5" :aria-label="t('review.files')">
    <ul class="flex flex-col gap-0.5">
      <li v-for="file in files" :key="file.key">
        <button
          type="button"
          class="motion-press flex w-full min-w-0 flex-col rounded-md px-2 py-1 text-left text-small outline-none hover:bg-brand/10 focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-brand/15"
          :aria-current="file.key === currentKey"
          @click="emit('pick', file.key)"
        >
          <span class="flex w-full min-w-0 items-center gap-1.5">
            <span class="min-w-0 flex-1 truncate font-medium">{{ file.name }}</span>
            <span
              v-if="commentCounts.get(file.key)"
              class="flex shrink-0 items-center gap-0.5 text-meta text-brand tabular-nums"
            >
              <MessageSquare class="size-3" aria-hidden="true" />
              {{ commentCounts.get(file.key) }}
              <span class="sr-only">{{
                t('review.comment_count', commentCounts.get(file.key) ?? 0)
              }}</span>
            </span>
          </span>
          <span class="flex w-full min-w-0 items-center gap-1.5 text-meta">
            <span class="min-w-0 flex-1 truncate font-mono text-muted-foreground">{{
              file.folder
            }}</span>
            <span class="sr-only">{{
              t('chat.diff_counts', { added: file.added, removed: file.removed })
            }}</span>
            <span class="flex shrink-0 gap-1 tabular-nums" aria-hidden="true">
              <span class="text-good">+{{ file.added }}</span>
              <span class="text-critical">−{{ file.removed }}</span>
            </span>
          </span>
        </button>
      </li>
    </ul>
  </nav>
</template>
