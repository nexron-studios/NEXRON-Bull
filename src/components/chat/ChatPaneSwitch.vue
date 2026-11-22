<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import ChatPane from '@/components/chat/ChatPane.vue'
import type { ChatTabState } from '@/utils/chatTab'
import { tabDirectionOf, type TabDirection } from '@/utils/motion'

// The desktop chat area: one pane per tab, and switching tabs moves the content the way the tab
// bar did (Figma "16 Motion"). The panes overlap for a moment, so neither waits for the other.
const { tab, tabs } = defineProps<{ tab: ChatTabState; tabs: ChatTabState[] }>()

const direction = ref<TabDirection>('next')

const motion = usePreferredReducedMotion()

// No transition classes under reduced motion: Vue then swaps the panes at once.
const transitionName = computed(() =>
  motion.value === 'reduce' ? undefined : `tab-${direction.value}`
)

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
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-route-content>
    <Transition :name="transitionName">
      <ChatPane :key="tab.id" :tab />
    </Transition>
  </div>
</template>
