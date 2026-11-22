<script setup lang="ts">
import { computed, ref, useId, type Component } from 'vue'
import { ChevronRight, ListTree, LoaderCircle, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ChatReasoning from '@/components/chat/ChatReasoning.vue'
import ChatToolCall from '@/components/chat/ChatToolCall.vue'
import { toolCardIdOf } from '@/composables/useChatReveal'
import type { ReadStep } from '@/utils/chatStream'
import { readCountsOf, readStateOf, type ReadState } from '@/utils/readGroup'
import type { ToolResultBlock } from '@/utils/toolPairs'

// Reads and searches in a row as one quiet line, "3 Dateien gelesen, 1 Suche" (Figma "30"), so
// they do not push the answer away; open, every call keeps its own row on the rail. Calls that change
// something never land here.
const {
  steps,
  results,
  isRunning = false
} = defineProps<{
  steps: ReadStep[]
  results: Map<string, ToolResultBlock>
  isRunning?: boolean
}>()

const isOpen = ref(false)

const { t } = useI18n()
const bodyId = useId()

const STATE_ICON: Partial<Record<ReadState, { icon: Component; class: string }>> = {
  running: { icon: LoaderCircle, class: 'animate-spin text-warning' },
  failed: { icon: X, class: 'text-critical' }
}

const label = computed(() =>
  readCountsOf(steps)
    .map(([category, count]) => t(`chat.reads.${category}`, count))
    .join(', ')
)
const state = computed(() => readStateOf(steps, results, isRunning))
</script>

<template>
  <!-- The panel asks for one of the cards inside: the line opens first. -->
  <section class="flex w-full max-w-[72ch] flex-col gap-2" @nch-reveal="isOpen = true">
    <button
      type="button"
      class="flex w-fit max-w-full items-center gap-2 rounded-sm text-small text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      :aria-expanded="isOpen"
      :aria-controls="bodyId"
      @click="isOpen = !isOpen"
    >
      <ListTree class="size-4 shrink-0" aria-hidden="true" />
      <span class="truncate">{{ label }}</span>
      <component
        :is="STATE_ICON[state]?.icon"
        v-if="STATE_ICON[state]"
        class="size-4 shrink-0"
        :class="STATE_ICON[state]?.class"
        aria-hidden="true"
      />
      <span class="sr-only">{{ t(`activity.tool_state.${state}`) }}</span>
      <ChevronRight
        class="size-4 shrink-0 transition-transform duration-200 ease-out"
        :class="{ 'rotate-90': isOpen }"
        aria-hidden="true"
      />
    </button>
    <ol v-show="isOpen" :id="bodyId" class="ml-2 flex flex-col gap-2">
      <li v-for="step in steps" :key="step.key">
        <ChatReasoning
          v-if="step.kind === 'reasoning'"
          :text="step.reasoning.text"
          :seconds="step.reasoning.seconds"
        />
        <ChatToolCall
          v-else
          :id="toolCardIdOf(step.block.id)"
          :name="step.block.name"
          :input="step.block.input"
          :result="results.get(step.block.id) ?? null"
          :is-running
        />
      </li>
    </ol>
  </section>
</template>
