<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Search } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import BrandBullLogo from '@/components/brand/BrandBullLogo.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import ChatStatusIcon from '@/components/chat/ChatStatusIcon.vue'
import NavRailLinks from '@/components/nav/NavRailLinks.vue'
import { useChatNavigation } from '@/composables/useChatNavigation'
import { useSessionOrder } from '@/composables/useSessionOrder'
import { useSidebarMachine } from '@/composables/useSidebarMachine'
import { useChatStore } from '@/stores/chat'
import { openQuestionOf } from '@/utils/answerCallouts'
import type { ChatTabState } from '@/utils/chatTab'
import { groupRows, isEmptyChat, sessionRowsOf, withManualOrder } from '@/utils/sessionList'

// The collapsed sidebar: the bull opens it again, then new session, search, the pages, and one
// status icon per open tab of the machine.
const emit = defineEmits<{ new: []; search: []; expand: [] }>()

const { t } = useI18n()
const { shownChatId, openChat } = useChatNavigation()
const { machine, tabsByMachine } = useSidebarMachine()
const order = useSessionOrder(machine)
const { finishRanks } = storeToRefs(useChatStore())

// The open tabs in the panel's order; no recent list, search or ticker here. The clock is read
// when tabs change, it only splits "done today" from "earlier".
const items = computed(() =>
  withManualOrder(
    groupRows(sessionRowsOf(tabsByMachine.value.get(machine.value) ?? [], [], Date.now())),
    order.stored.value
  )
    .flatMap((entry) => entry.rows)
    .map((row) => row.tab)
)

// Same order as the icon: an open question outranks the finish number.
const statusLabelOf = (tab: ChatTabState) => {
  if (isEmptyChat(tab) && tab.limit.kind !== 'waiting') return t('chat.status.empty')
  if (openQuestionOf(tab)) return t('chat.status.question')
  const rank = finishRanks.value.get(tab.id)
  if (rank) return t('finish.rank', { n: rank })
  if (tab.status === 'idle' && tab.notice !== null) return t('chat.status.failed')
  return t(`chat.status.${tab.status}`)
}
</script>

<template>
  <nav
    class="flex h-full min-h-0 flex-col items-center gap-3 bg-background py-3"
    :aria-label="t('sidebar.label')"
  >
    <!-- The bull is the way back to the panel, like the logo of a collapsed app sidebar. -->
    <NchIconButton
      :label="t('sidebar.show')"
      class="size-9 shrink-0 hover:bg-muted"
      @click="emit('expand')"
    >
      <BrandBullLogo :size="22" />
    </NchIconButton>
    <NchIconButton
      :label="t('sidebar.new_session')"
      class="bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover hover:text-brand-foreground"
      @click="emit('new')"
    >
      <Plus class="size-4" aria-hidden="true" />
    </NchIconButton>
    <NchIconButton :label="t('sidebar.search')" @click="emit('search')">
      <Search class="size-4" aria-hidden="true" />
    </NchIconButton>
    <span class="h-px w-6 shrink-0 bg-border" aria-hidden="true" />
    <NavRailLinks />
    <span class="h-px w-6 shrink-0 bg-border" aria-hidden="true" />
    <ul
      class="flex min-h-0 w-full flex-1 scrollbar-none flex-col items-center gap-1 overflow-y-auto"
    >
      <li v-for="tab in items" :key="tab.id" class="relative flex w-full justify-center">
        <span
          v-if="tab.id === shownChatId"
          class="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand"
          aria-hidden="true"
        />
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              type="button"
              class="grid h-8 w-9 place-items-center rounded-lg hover:bg-muted"
              :class="{ 'bg-muted': tab.id === shownChatId }"
              :aria-label="
                t('sidebar.rail_item', {
                  title: tab.title || t('chat.new_chat'),
                  status: statusLabelOf(tab)
                })
              "
              :aria-current="tab.id === shownChatId ? 'true' : undefined"
              @click="openChat(tab.id)"
            >
              <ChatStatusIcon
                :status="tab.status"
                :is-empty="isEmptyChat(tab)"
                :rank="finishRanks.get(tab.id) ?? null"
                :is-failed="tab.notice !== null"
                :is-waiting="tab.limit.kind === 'waiting'"
                :has-question="openQuestionOf(tab) !== null"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{{ tab.title || t('chat.new_chat') }}</TooltipContent>
        </Tooltip>
      </li>
    </ul>
  </nav>
</template>
