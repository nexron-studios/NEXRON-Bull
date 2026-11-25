<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue'
import { ChevronDown, ChevronUp, FileDiff, TextCursorInput } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchEmpty from '@/components/common/NchEmpty.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Button } from '@/components/ui/button'
import ReviewFileList from '@/components/review/ReviewFileList.vue'
import ReviewFilePane from '@/components/review/ReviewFilePane.vue'
import { useChangedFiles } from '@/composables/useChangedFiles'
import { useIsPhone } from '@/composables/useViewport'
import { useDiffReviewStore } from '@/stores/diffReview'
import type { ChatTabState } from '@/utils/chatTab'
import { messageOfComments } from '@/utils/diffReview'
import { isTextField } from '@/utils/textField'

// Inside the review: the chat's changed files beside the diff of the chosen one, stepped through
// with J and K or the arrows in the header; below, the comments waiting to go into the composer.
// Mounted only while the review is open, so a closed one asks no machine for anything.
const { tab } = defineProps<{ tab: ChatTabState }>()
const emit = defineEmits<{ insert: [text: string]; reveal: [cardId: string] }>()

const NEXT_KEY = 'j'
const PREVIOUS_KEY = 'k'

const root = useTemplateRef<HTMLElement>('root')

const { t } = useI18n()
const store = useDiffReviewStore()
const isPhone = useIsPhone()
const { changedFiles, chatHunksOfFile } = useChangedFiles(() => tab)

const current = computed(
  () => changedFiles.value.find((file) => file.key === store.fileKey) ?? changedFiles.value[0]
)
const position = computed(() => (current.value ? changedFiles.value.indexOf(current.value) : -1))
const comments = computed(() => store.commentsOf(tab.id))
const commentCounts = computed(() => store.countsByFile(tab.id))

// Read by the pane only when the chat's edits stand in for git's diff.
const currentChatHunks = () => (current.value ? chatHunksOfFile(current.value.key) : [])
const step = async (delta: number) => {
  const next = changedFiles.value[position.value + delta]
  if (!next) return
  store.show(next.key)
  // The diff with the focus goes, or the step button turns disabled at the end: J and K go on.
  await nextTick()
  if (!root.value?.contains(document.activeElement)) root.value?.focus()
}
const insert = () => {
  if (!comments.value.length) return
  const text = messageOfComments(
    comments.value,
    changedFiles.value.map((file) => file.key)
  )
  store.clear(tab.id)
  emit('insert', text)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (isTextField(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === NEXT_KEY) void step(1)
  if (event.key === PREVIOUS_KEY) void step(-1)
}
</script>

<template>
  <div
    ref="root"
    tabindex="-1"
    class="flex min-h-0 flex-col gap-3 outline-none"
    :class="isPhone ? 'h-[70dvh]' : 'h-full'"
    @keydown="handleKeydown"
  >
    <NchEmpty
      v-if="!current"
      :icon="FileDiff"
      :title="t('panel.changed_files_empty')"
      :hint="t('panel.changed_files_empty_hint')"
    />
    <div v-else class="flex min-h-0 min-w-0 flex-1 gap-4">
      <ReviewFileList
        v-if="!isPhone && changedFiles.length > 1"
        class="w-60 shrink-0"
        :files="changedFiles"
        :current-key="current.key"
        :comment-counts
        @pick="store.show"
      />
      <ReviewFilePane
        :tab
        :file="current"
        :chat-hunks="currentChatHunks"
        @reveal="emit('reveal', current.cardId)"
      >
        <template v-if="changedFiles.length > 1" #actions>
          <span class="shrink-0 text-meta text-muted-foreground tabular-nums">{{
            t('review.position', { n: position + 1, count: changedFiles.length })
          }}</span>
          <NchIconButton
            :label="t('review.previous', { key: PREVIOUS_KEY.toUpperCase() })"
            size="icon-sm"
            :disabled="position <= 0"
            @click="step(-1)"
          >
            <ChevronUp class="size-4" aria-hidden="true" />
          </NchIconButton>
          <NchIconButton
            :label="t('review.next', { key: NEXT_KEY.toUpperCase() })"
            size="icon-sm"
            :disabled="position >= changedFiles.length - 1"
            @click="step(1)"
          >
            <ChevronDown class="size-4" aria-hidden="true" />
          </NchIconButton>
        </template>
      </ReviewFilePane>
    </div>
    <footer class="flex items-center justify-end gap-3">
      <span class="text-small text-muted-foreground tabular-nums" aria-live="polite">{{
        t('review.comment_count', comments.length)
      }}</span>
      <Button :disabled="!comments.length" @click="insert">
        <TextCursorInput class="size-4" aria-hidden="true" />
        {{ t('review.insert') }}
      </Button>
    </footer>
  </div>
</template>
