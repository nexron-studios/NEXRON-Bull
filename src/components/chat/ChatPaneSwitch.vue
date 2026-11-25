<script setup lang="ts">
import { ref, watch } from 'vue'
import ChatPane from '@/components/chat/ChatPane.vue'
import type { ChatTabState } from '@/utils/chatTab'
import { tabDirectionOf, type TabDirection } from '@/utils/motion'

// The desktop chat area: one pane per tab. A switch swaps the pane at once; only the new messages
// fade in from the side of the selected tab (transitions.css, Figma "16 Motion"), so the click
// answers immediately and nothing the tabs share moves.
const { tab, tabs } = defineProps<{ tab: ChatTabState; tabs: ChatTabState[] }>()
const emit = defineEmits<{ preview: [url: string] }>()

const direction = ref<TabDirection>('next')

// Before the render that mounts the new pane, so it already carries the new direction.
watch(
  () => tab.id,
  (next, previous) => {
    direction.value = tabDirectionOf(
      tabs.map((entry) => entry.id),
      previous,
      next
    )
  },
  { flush: 'pre' }
)
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-route-content>
    <ChatPane
      :key="tab.id"
      :tab
      :class="`tab-in-${direction}`"
      @preview="emit('preview', $event)"
    />
  </div>
</template>
