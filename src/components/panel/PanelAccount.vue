<script setup lang="ts">
import { ArrowLeftRight, UserRound } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AccountDot from '@/components/account/AccountDot.vue'
import AccountPopover from '@/components/account/AccountPopover.vue'
import { useTabAccountKey } from '@/composables/useTabAccountKey'
import type { ChatTabState } from '@/utils/chatTab'

// The account the chat runs on and the way to switch it (Figma "30"). Machine, folder and branch
// moved into the session bar above the chat, so this is all that is left of "Umgebung".
const { tab } = defineProps<{ tab: ChatTabState }>()

const { t } = useI18n()
const accountKey = useTabAccountKey(() => tab)
</script>

<template>
  <div class="flex items-center gap-2 text-small">
    <UserRound class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span class="text-muted-foreground">{{ t('panel.account') }}</span>
    <span
      class="ml-auto flex min-w-0 items-center gap-1.5 rounded-sm border border-border px-1.5 text-meta"
    >
      <AccountDot :account-key="accountKey" />
      <span class="truncate">{{ tab.account }}</span>
    </span>
    <AccountPopover
      :tab
      :label="t('account.switch_label', { account: tab.account })"
      variant="outline"
      size="xs"
      class="motion-press shrink-0"
    >
      <ArrowLeftRight aria-hidden="true" />
      {{ t('panel.switch') }}
    </AccountPopover>
  </div>
</template>
