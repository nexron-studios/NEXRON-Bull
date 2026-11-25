<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import ReviewBody from '@/components/review/ReviewBody.vue'
import { useChatReveal } from '@/composables/useChatReveal'
import { useDiffReviewStore } from '@/stores/diffReview'
import type { ChatTabState } from '@/utils/chatTab'

// The diff review of this tab's changed files, opened from the panel (store `diffReview`): a wide
// dialog on the desktop, a sheet on the phone. Lives in the chat pane next to the composer, so
// "Ins Eingabefeld" can hand the comments over the way a marked image does.
const { tab } = defineProps<{ tab: ChatTabState }>()
const emit = defineEmits<{ insert: [text: string] }>()

/** Wide enough for two columns of code beside the file list, never past the window. */
const CONTENT_CLASS =
  'h-[min(56rem,calc(100dvh-4rem))] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[min(80rem,calc(100vw-4rem))]'

// Leaving for the chat or the composer puts focus there; closing must not pull it back.
const hasLeft = ref(false)

const { t } = useI18n()
const store = useDiffReviewStore()
const { revealTool } = useChatReveal()

const open = computed({
  get: () => store.openTabId === tab.id,
  set: (isOpen) => {
    if (!isOpen) store.close()
  }
})

const leave = () => {
  hasLeft.value = true
  store.close()
}
const insert = (text: string) => {
  leave()
  emit('insert', text)
}
const reveal = async (cardId: string) => {
  leave()
  await revealTool(cardId)
}

watch(open, (isOpen) => {
  if (isOpen) hasLeft.value = false
})
</script>

<template>
  <NchResponsiveDialog
    v-model:open="open"
    :title="t('review.title')"
    :description="t('review.description')"
    :content-class="CONTENT_CLASS"
    :restores-focus="!hasLeft"
  >
    <ReviewBody v-if="open" :tab @insert="insert" @reveal="reveal" />
  </NchResponsiveDialog>
</template>
