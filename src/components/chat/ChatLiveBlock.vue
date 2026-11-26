<script setup lang="ts">
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'
import ChatReasoning from '@/components/chat/ChatReasoning.vue'
import type { ChatTabState } from '@/utils/chatTab'

// The block Claude is streaming. Its own component so a token re-renders only this, not the pane
// with every message above it: the pane never reads `tab.live` while rendering.
const { tab } = defineProps<{ tab: ChatTabState }>()
</script>

<template>
  <ChatReasoning
    v-if="tab.live.kind === 'thinking'"
    :text="tab.live.text"
    is-streaming
    class="message-fade"
  />
  <!-- self-start: as wide as the finished reply that replaces it, so no line rewraps then. -->
  <ChatMarkdown
    v-else-if="tab.live.kind === 'writing'"
    :text="tab.live.text"
    is-streaming
    class="message-fade self-start"
  />
</template>
