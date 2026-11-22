<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import AccountDot from '@/components/account/AccountDot.vue'
import AccountPlan from '@/components/account/AccountPlan.vue'
import AccountPopover from '@/components/account/AccountPopover.vue'
import ChatModeChip from '@/components/chat/ChatModeChip.vue'
import ChatModelPopover from '@/components/chat/ChatModelPopover.vue'
import { useQuota } from '@/composables/useQuota'
import { useSessionSettings } from '@/composables/useSessionSettings'
import { useTabAccountKey } from '@/composables/useTabAccountKey'
import { useChatSettingsStore } from '@/stores/chatSettings'
import type { ChatTabState } from '@/utils/chatTab'
import { planLabelOf, quotaOfProfile } from '@/utils/quota'
import { nextModeOf } from '@/utils/sessionSettings'

// The settings of a chat under its composer: model and effort, account, mode (Figma "33"). Each
// chip changes what it shows; model and mode take effect in the running session.
// `isCompact`: the phone, where the account goes without its plan and the mode sits in the sheet
// behind the model chip.
const { tab, isCompact = false } = defineProps<{ tab: ChatTabState; isCompact?: boolean }>()

const root = useTemplateRef<HTMLElement>('root')

const { t } = useI18n()
const accountKey = useTabAccountKey(() => tab)
const { profiles } = useQuota()
const { settings, chipLabel } = useSessionSettings(() => tab)
const chatSettings = useChatSettingsStore()

const plan = computed(() =>
  isCompact
    ? null
    : planLabelOf(quotaOfProfile(profiles.value, tab.machine, tab.profile)?.plan ?? null)
)
const composerForm = computed(() => root.value?.closest('form') ?? null)

// Shift+Tab in the composer's text field walks the modes like the terminal does. Listened for on
// the composer's form, so the field itself needs no handler; Tab alone still moves focus.
const cycleModeByKey = (event: KeyboardEvent) => {
  if (event.key !== 'Tab' || !event.shiftKey || event.isComposing) return
  if (!(event.target instanceof HTMLTextAreaElement)) return
  event.preventDefault()
  void chatSettings.setMode(
    tab.id,
    nextModeOf(settings.value.mode, chatSettings.refusedModesOf(tab.id))
  )
}

useEventListener(composerForm, 'keydown', cycleModeByKey)
</script>

<template>
  <div ref="root" class="flex min-w-0 scrollbar-none items-center gap-1 overflow-x-auto">
    <ChatModelPopover :tab :settings :label="chipLabel" />
    <AccountPopover
      :tab
      :label="t('account.switch_label', { account: tab.account })"
      class="h-7 shrink-0 gap-1.5 px-2 text-meta font-normal text-muted-foreground"
    >
      <AccountDot :account-key="accountKey" />
      {{ tab.account }}
      <AccountPlan v-if="plan" :plan />
      <ChevronDown class="size-3.5" aria-hidden="true" />
    </AccountPopover>
    <ChatModeChip v-if="!isCompact" :tab :mode="settings.mode" />
  </div>
</template>
