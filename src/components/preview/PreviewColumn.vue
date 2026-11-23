<script setup lang="ts">
import { nextTick } from 'vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import PreviewResizeHandle from '@/components/preview/PreviewResizeHandle.vue'
import type { usePreviewPane } from '@/composables/usePreviewPane'
import { PREVIEW_TOGGLE_ID, usePreviewStore } from '@/stores/preview'
import type { ChatTabState } from '@/utils/chatTab'
import type { PreviewSize } from '@/utils/previewPane'

// The preview as a column beside the chat (ChatView), with its draggable left edge.
const { tab, pane } = defineProps<{
  tab: ChatTabState
  pane: ReturnType<typeof usePreviewPane>
}>()

const preview = usePreviewStore()

// Shut from inside the column: the focus goes to the button that brings it back, once the
// column is gone, so the button is announced as no longer pressed.
const focusToggle = async () => {
  await nextTick()
  document.getElementById(PREVIEW_TOGGLE_ID)?.focus()
}
const resize = async (next: PreviewSize) => {
  await pane.resize(next)
  if (!next.isOpen) await focusToggle()
}
const close = async () => {
  await preview.toggle()
  await focusToggle()
}
</script>

<template>
  <div
    class="relative flex min-h-0 shrink-0 border-l border-border"
    :style="{ width: `${pane.width.value}px` }"
    data-snap-preview
  >
    <PreviewPane
      :key="tab.id"
      :tab
      class="transition-opacity duration-150"
      :class="{ 'opacity-40': pane.isClosing.value }"
      @close="close"
    />
    <PreviewResizeHandle
      :width="pane.width.value"
      :max-width="pane.maxWidth.value"
      :is-closing="pane.isClosing.value"
      @preview="pane.preview"
      @resize="resize"
      @reset="pane.resetWidth"
    />
  </div>
</template>
