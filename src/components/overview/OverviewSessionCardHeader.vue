<script setup lang="ts">
import { computed } from 'vue'
import { LayoutPanelTop } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AccountDot from '@/components/account/AccountDot.vue'
import OverviewStatusPill from '@/components/overview/OverviewStatusPill.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTabAccountKey } from '@/composables/useTabAccountKey'
import { copyText } from '@/lib/clipboard'
import type { ChatTabState } from '@/utils/chatTab'
import type { CardStatus } from '@/utils/sessionCard'
import { chatNameOf, folderNameOf } from '@/utils/sessionList'

// Who the card is about, like the Agent Dashboard's card head: folder › chat name, the account,
// the status on the right. The name gives way last: the account truncates first. A click on the
// name copies the full session ID; the card opens on any click outside a button.
const { tab, status } = defineProps<{ tab: ChatTabState; status: CardStatus }>()

const { t } = useI18n()
const accountKey = useTabAccountKey(() => tab)

const folder = computed(() => folderNameOf(tab.cwd))
// A chat gets its fixed name with its session; until then the folder alone names it.
const chatName = computed(() => (tab.sessionId ? chatNameOf(tab.cwd, tab.sessionId) : null))

const copyId = () => {
  if (tab.sessionId) void copyText(tab.sessionId)
}
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="flex min-w-0 flex-1 items-center gap-2.5 text-small">
      <span class="flex min-w-0 items-center gap-1.5">
        <LayoutPanelTop class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="truncate">
          <template v-if="chatName">
            <span class="text-muted-foreground">{{ folder }} › </span>
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="inline cursor-copy rounded-sm font-semibold outline-none hover:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                  :aria-label="t('overview.card.copy_session_id', { name: chatName })"
                  @click="copyId"
                >
                  {{ chatName }}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {{ t('sidebar.session_id_copy', { id: tab.sessionId }) }}
              </TooltipContent>
            </Tooltip>
          </template>
          <span v-else class="font-semibold">{{ folder }}</span>
        </span>
      </span>
      <span class="flex min-w-0 shrink-[100] items-center gap-1.5 text-meta text-muted-foreground">
        <AccountDot :account-key="accountKey" />
        <span class="truncate">{{ tab.account }}</span>
      </span>
    </div>
    <OverviewStatusPill :status />
  </div>
</template>
