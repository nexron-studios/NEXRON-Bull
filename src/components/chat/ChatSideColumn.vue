<script setup lang="ts">
import { nextTick } from 'vue'
import NchColumnEdge from '@/components/common/NchColumnEdge.vue'
import type { SideColumn } from '@/composables/useChatColumns'

// A column right of the chat (preview, info panel) with its draggable left edge. The slot gets
// `isClosing` (a drag would shut the column, the content fades) and `close` for its own button.
// It glides open and shut (useLayoutGlide); the content keeps its width meanwhile and is clipped.
const { column, label, toggleId } = defineProps<{
  column: SideColumn
  /** Names the edge for screen readers */
  label: string
  /** The header button that brings the column back */
  toggleId: string
}>()

// Shut from inside (Enter on the edge, a close button): the focus goes to the button that brings it
// back, once the column is gone, so the button is announced as no longer pressed.
const close = async () => {
  await column.resize({ isOpen: false })
  await nextTick()
  document.getElementById(toggleId)?.focus()
}
</script>

<template>
  <div
    class="flex min-h-0 w-(--glide-width) shrink-0"
    :style="{ '--glide-width': `${column.layout.value.width}px` }"
    data-glide
  >
    <div class="relative flex min-h-0 min-w-0 flex-1" data-glide-content>
      <slot :is-closing="column.isClosing.value" :close />
      <NchColumnEdge
        :label
        :width="column.layout.value.width"
        :min-width="column.minWidth"
        :max-width="column.layout.value.maxWidth"
        :is-closing="column.isClosing.value"
        @preview="column.preview"
        @resize="column.resize"
        @reset="column.resetWidth"
        @close="close"
      />
    </div>
  </div>
</template>
