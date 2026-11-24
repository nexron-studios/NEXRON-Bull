<script setup lang="ts">
import { nextTick } from 'vue'
import PanelInfo from '@/components/panel/PanelInfo.vue'
import PanelResizeHandle from '@/components/panel/PanelResizeHandle.vue'
import { INFO_PANEL_TOGGLE_ID, type useInfoPanel } from '@/composables/useInfoPanel'
import type { ChatTabState } from '@/utils/chatTab'

// The info panel as a column right of the chat (ChatView), with its draggable left edge.
const { tab, panel } = defineProps<{
  tab: ChatTabState
  panel: ReturnType<typeof useInfoPanel>
}>()

// Enter on the panel's edge shut it: the focus goes to the button that brings it back.
// Focus moves once the panel is gone, so the toggle is announced as no longer pressed.
const closeFromEdge = async () => {
  await panel.resize({ isOpen: false })
  await nextTick()
  document.getElementById(INFO_PANEL_TOGGLE_ID)?.focus()
}
</script>

<template>
  <div
    class="relative flex min-h-0 shrink-0"
    :style="{ width: `${panel.width.value}px` }"
    data-snap-panel
  >
    <PanelInfo
      :key="tab.id"
      :tab
      class="transition-opacity duration-150"
      :class="{ 'opacity-40': panel.isClosing.value }"
    />
    <PanelResizeHandle
      :width="panel.width.value"
      :max-width="panel.maxWidth.value"
      :is-closing="panel.isClosing.value"
      @preview="panel.preview"
      @resize="panel.resize"
      @reset="panel.resetWidth"
      @close="closeFromEdge"
    />
  </div>
</template>
