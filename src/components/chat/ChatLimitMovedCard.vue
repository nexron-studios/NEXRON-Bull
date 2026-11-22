<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeftRight, ArrowRight, CornerDownRight, Undo2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { AccountRefProps } from '@/types/agentd.type'
import { Button } from '@/components/ui/button'
import ChatLimitAccount from '@/components/chat/ChatLimitAccount.vue'
import { useChatStore } from '@/stores/chat'
import { glowClassOf } from '@/theme/glow'

// agentd moved the chat because `from` was full (Figma "24", "M25"). The card stands in the chat
// where it happened. Only the latest move of the chat on screen can be undone: the chat then goes
// back to `from` and waits there for the reset.
const { from, to, messageId } = defineProps<{
  from: AccountRefProps
  to: AccountRefProps
  messageId: string
}>()

const { t } = useI18n()
const chat = useChatStore()

const canUndo = computed(() => {
  const tab = chat.activeTab
  if (tab?.limit.kind !== 'moved') return false
  const latest = tab.messages.findLast((message) =>
    message.blocks.some((block) => block.type === 'account_moved')
  )
  return latest?.uuid === messageId
})

const undo = () => {
  const tab = chat.activeTab
  if (tab) void chat.limitMove(tab.id, from.profile, 'wait')
}
</script>

<template>
  <section
    :class="glowClassOf('brand')"
    class="flex flex-col gap-2 rounded-xl px-3 py-2.5"
    role="status"
  >
    <h2 class="flex min-w-0 items-center gap-2 text-small">
      <ArrowLeftRight class="size-4 shrink-0 text-brand" aria-hidden="true" />
      <span class="font-semibold">{{ t('chat.limit.moved_title', { account: to.label }) }}</span>
    </h2>
    <p class="text-small text-muted-foreground">
      {{ t('chat.limit.moved_text', { from: from.label, to: to.label }) }}
    </p>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <ChatLimitAccount :account="from" is-full />
      <ArrowRight
        class="size-3.5 shrink-0 text-muted-foreground max-sm:hidden"
        aria-hidden="true"
      />
      <ChatLimitAccount :account="to" />
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="flex items-center gap-1.5 text-meta text-muted-foreground">
        <CornerDownRight class="size-3.5 shrink-0" aria-hidden="true" />
        {{ t('chat.limit.moved_continue') }}
      </span>
      <Button v-if="canUndo" variant="outline" size="sm" @click="undo">
        <Undo2 aria-hidden="true" />
        {{ t('chat.limit.undo') }}
      </Button>
    </div>
  </section>
</template>
