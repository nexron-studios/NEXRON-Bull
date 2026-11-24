<script setup lang="ts">
import { ref, watch } from 'vue'
import ChatPane from '@/components/chat/ChatPane.vue'
import type { ChatTabState } from '@/utils/chatTab'
import { tabDirectionOf, type TabDirection } from '@/utils/motion'

// The desktop chat area: one pane per tab. Switching dissolves the old chat into the new one,
// which drifts in from the side of the selected tab (Figma "16 Motion"). Under reduced motion the
// drift is off (transitions.css) and the dissolve stays. `isolate` keeps the leaving pane's
// z-index inside this area.
const { tab, tabs } = defineProps<{ tab: ChatTabState; tabs: ChatTabState[] }>()

const direction = ref<TabDirection>('next')

// Before the render that swaps the panes, so the leaving one already gets the new direction.
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
  <div class="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden" data-route-content>
    <Transition :name="`tab-${direction}`">
      <ChatPane :key="tab.id" :tab />
    </Transition>
  </div>
</template>
