<script setup lang="ts">
import { computed } from 'vue'
import { MessageSquareText } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ChatTitleText from '@/components/chat/ChatTitleText.vue'
import OverviewSessionCardContext from '@/components/overview/OverviewSessionCardContext.vue'
import OverviewSessionCardFooter from '@/components/overview/OverviewSessionCardFooter.vue'
import OverviewSessionCardHeader from '@/components/overview/OverviewSessionCardHeader.vue'
import OverviewSessionCardMeta from '@/components/overview/OverviewSessionCardMeta.vue'
import OverviewSessionCardStep from '@/components/overview/OverviewSessionCardStep.vue'
import type { ChatTabState } from '@/utils/chatTab'
import { cardPromptsOf, cardStatusOf, startPromptOf } from '@/utils/sessionCard'

// A running session in the overview, built like the Agent Dashboard's SessionCard: who and its
// status, the title with one info line, the context, what was asked and what Claude does, and the
// buttons always in the same place. Every text area has a fixed number of lines, so a card keeps
// its height while its text changes and a row of cards stays calm.
const { tab, now } = defineProps<{ tab: ChatTabState; now: number }>()
const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()

// The store replaces the tab on every streamed token but keeps these; the prompts are read again
// only when one of them changes, not per token.
const messages = computed(() => tab.messages)
const pending = computed(() => tab.pending)
const history = computed(() => tab.history)
const hasMore = computed(() => tab.hasMore)

const status = computed(() => cardStatusOf(tab))
const title = computed(() => tab.title || t('chat.new_chat'))
const prompts = computed(() =>
  cardPromptsOf({
    messages: messages.value,
    pending: pending.value,
    history: history.value,
    hasMore: hasMore.value
  })
)
const startPrompt = computed(() => startPromptOf(tab.title, prompts.value))

// A click anywhere on the card opens the chat, like a finished row; its own buttons handle their
// clicks, and a click that ends a text selection was meant for the text.
const openCard = (event: MouseEvent) => {
  if (event.target instanceof Element && event.target.closest('button')) return
  if (window.getSelection()?.toString()) return
  emit('open')
}
</script>

<template>
  <article
    class="relative flex min-w-0 cursor-pointer flex-col rounded-xl border bg-card p-5 transition-colors duration-150 hover:bg-muted/30"
    :class="{
      'border-critical/50': status === 'asking',
      'border-warning/50': status === 'question',
      'border-border hover:border-input': status !== 'asking' && status !== 'question'
    }"
    @click="openCard"
  >
    <OverviewSessionCardHeader :tab :status />

    <h3 class="mt-4 truncate text-title font-semibold tracking-tight">
      <ChatTitleText :title />
    </h3>
    <OverviewSessionCardMeta class="mt-1" :tab :now :prompt-count="prompts.count" />
    <OverviewSessionCardContext :tab-id="tab.id" :model="tab.model" />
    <p class="mt-1 h-5 truncate text-small text-muted-foreground">
      <template v-if="startPrompt">
        <span class="font-medium text-subtle">{{ t('overview.card.started_with') }}</span>
        {{ startPrompt }}
      </template>
    </p>

    <div class="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
      <div class="flex gap-2.5 text-small">
        <MessageSquareText
          class="mt-0.5 size-4 shrink-0 text-muted-foreground"
          :class="{ invisible: !prompts.last }"
          aria-hidden="true"
        />
        <p class="line-clamp-2 h-10 [overflow-wrap:anywhere]">
          <span v-if="prompts.last" class="sr-only">{{ t('overview.card.last_prompt') }}</span>
          {{ prompts.last }}
        </p>
      </div>
      <OverviewSessionCardStep :tab />
    </div>

    <OverviewSessionCardFooter :tab :title @open="emit('open')" />
  </article>
</template>
