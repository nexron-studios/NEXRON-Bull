<script setup lang="ts">
import { ChevronLeft, Ellipsis, Monitor } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import ChatStatusIcon from '@/components/chat/ChatStatusIcon.vue'
import ChatTitleText from '@/components/chat/ChatTitleText.vue'
import { openQuestionOf } from '@/utils/answerCallouts'
import type { ChatTabState } from '@/utils/chatTab'
import { shownStatusOf } from '@/utils/shownStatus'
import { isEmptyChat } from '@/utils/sessionList'
import { useMachineLabel } from '@/composables/useMachineLabel'

// Top bar of a chat on a phone (Figma "M04"): back to the list, what the chat is and where it
// runs, and a menu for the rest of the desktop session bar.
const { tab } = defineProps<{ tab: ChatTabState }>()
const emit = defineEmits<{ back: []; menu: [] }>()

const { t } = useI18n()
const { labelOf: machineLabelOf } = useMachineLabel()
</script>

<template>
  <header class="shrink-0 border-b border-border pt-safe">
    <div class="flex h-14 items-center gap-1 px-1">
      <NchIconButton :label="t('chat.phone.back')" class="size-11 shrink-0" @click="emit('back')">
        <ChevronLeft class="size-5" aria-hidden="true" />
      </NchIconButton>
      <div class="flex min-w-0 flex-1 flex-col items-center gap-0.5">
        <h1 class="flex max-w-full min-w-0 items-center gap-1.5 text-body font-semibold">
          <ChatStatusIcon
            :status="shownStatusOf(tab)"
            :is-empty="isEmptyChat(tab)"
            :is-failed="tab.notice !== null"
            :is-waiting="tab.limit.kind === 'waiting'"
            :has-question="openQuestionOf(tab) !== null"
          />
          <span class="truncate"
            ><ChatTitleText :title="tab.title || t('chat.new_chat')" :tab
          /></span>
        </h1>
        <p class="flex max-w-full min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
          <template v-if="machineLabelOf(tab.machine)">
            <Monitor class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ machineLabelOf(tab.machine) }}</span>
          </template>
          <span class="shrink-0 rounded-sm border border-border px-1.5 text-subtle">
            <span class="sr-only">{{ t('chat.account') }}:</span>
            {{ tab.account }}
          </span>
        </p>
      </div>
      <NchIconButton :label="t('chat.phone.menu')" class="size-11 shrink-0" @click="emit('menu')">
        <Ellipsis class="size-5" aria-hidden="true" />
      </NchIconButton>
    </div>
  </header>
</template>
