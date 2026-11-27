<script setup lang="ts">
import { computed } from 'vue'
import ChatHookLine from '@/components/chat/ChatHookLine.vue'
import ChatMessageItem from '@/components/chat/ChatMessageItem.vue'
import ChatReadGroup from '@/components/chat/ChatReadGroup.vue'
import ChatReasoning from '@/components/chat/ChatReasoning.vue'
import ChatSources from '@/components/chat/ChatSources.vue'
import ChatToolCall from '@/components/chat/ChatToolCall.vue'
import { toolCardIdOf } from '@/composables/useChatReveal'
import type { StreamItem } from '@/utils/chatStream'
import { hookBlockOf } from '@/utils/toolOutput'
import type { ToolResultBlock } from '@/utils/toolPairs'

// One entry of the chat stream; which component draws it follows from its kind.
const { item, results, isRunning } = defineProps<{
  item: StreamItem
  results: Map<string, ToolResultBlock>
  /** Claude is working on the current turn */
  isRunning: boolean
}>()

const result = computed(() => (item.kind === 'tool' ? (results.get(item.block.id) ?? null) : null))
// A PreToolUse hook that stopped the call: the hook line takes the card's place (Figma "36").
const hookBlock = computed(() => hookBlockOf(result.value))
</script>

<template>
  <ChatMessageItem
    v-if="item.kind === 'message'"
    :message="item.message"
    :results
    :is-running
    :stats="item.stats"
  />
  <ChatReasoning
    v-else-if="item.kind === 'reasoning'"
    :text="item.reasoning.text"
    :seconds="item.reasoning.seconds"
  />
  <ChatHookLine
    v-else-if="item.kind === 'tool' && hookBlock"
    :id="toolCardIdOf(item.block.id)"
    event="PreToolUse"
    :tool="hookBlock.tool"
    outcome="blocked"
    :text="hookBlock.reason"
    :command="hookBlock.command"
  />
  <ChatToolCall
    v-else-if="item.kind === 'tool'"
    :id="toolCardIdOf(item.block.id)"
    :name="item.block.name"
    :input="item.block.input"
    :result
    :is-running="isRunning && item.isCurrent"
  />
  <ChatReadGroup
    v-else-if="item.kind === 'reads'"
    :steps="item.steps"
    :results
    :is-running="isRunning && item.isCurrent"
  />
  <ChatSources v-else :sources="item.sources" />
</template>
