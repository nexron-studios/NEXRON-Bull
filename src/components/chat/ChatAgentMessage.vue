<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { Bot, ChevronDown } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ChatMarkdown from '@/components/chat/ChatMarkdown.vue'

// A subagent's report (or another agent's message) reached Claude as a prompt. It reads as a
// quiet line like "compacted", folded, because Claude's answer below already says what matters.
const { name, text, isReport } = defineProps<{
  name: string | null
  text: string
  isReport: boolean
}>()

const isOpen = ref(false)

const { t } = useI18n()
const bodyId = useId()

const label = computed(() => {
  if (isReport) return name ? t('chat.agent_report', { name }) : t('chat.agent_report_unnamed')
  return name ? t('chat.agent_message', { name }) : t('chat.agent_message_unnamed')
})
</script>

<template>
  <div class="flex flex-col gap-1.5 py-1">
    <button
      type="button"
      class="flex w-fit max-w-full items-center gap-1.5 rounded-sm text-small text-muted-foreground hover:text-foreground"
      :aria-expanded="isOpen"
      :aria-controls="bodyId"
      @click="isOpen = !isOpen"
    >
      <Bot class="size-4 shrink-0" aria-hidden="true" />
      <span class="text-left">{{ label }}</span>
      <ChevronDown
        class="size-4 shrink-0 transition-transform duration-200 ease-out"
        :class="{ 'rotate-180': isOpen }"
        aria-hidden="true"
      />
    </button>
    <div
      v-show="isOpen"
      :id="bodyId"
      class="max-w-[72ch] border-l-2 border-border pl-3 text-small text-muted-foreground"
    >
      <ChatMarkdown :text />
    </div>
  </div>
</template>
