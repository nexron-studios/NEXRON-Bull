<script setup lang="ts">
import { computed } from 'vue'
import {
  Bell,
  ChevronRight,
  FolderOpen,
  Gauge,
  History,
  Moon,
  Sparkles,
  SquareTerminal,
  UserRound,
  X
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AccountPicker from '@/components/account/AccountPicker.vue'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import NchThemeToggle from '@/components/common/NchThemeToggle.vue'
import { Button } from '@/components/ui/button'
import ChatNotifyToggle from '@/components/chat/ChatNotifyToggle.vue'
import { useSessionMenuItems } from '@/composables/useSessionMenuItems'
import { useContextUsageStore } from '@/stores/contextUsage'
import { useRewindStore } from '@/stores/rewind'
import { useSessionSettings } from '@/composables/useSessionSettings'
import { useChatSettingsStore } from '@/stores/chatSettings'
import { useTerminalStore } from '@/stores/terminals'
import PanelContext from '@/components/panel/PanelContext.vue'
import PanelSection from '@/components/panel/PanelSection.vue'
import PanelUsage from '@/components/panel/PanelUsage.vue'
import type { ChatTabState } from '@/utils/chatTab'
import { targetOfTab, type SessionAction } from '@/utils/sessionActions'
import { folderNameOf } from '@/utils/sessionList'

// The "…" of a chat on a phone: what the desktop shows in the session bar, the header tools and
// the panel right of the chat (account with switch, context, quota).
const { tab } = defineProps<{ tab: ChatTabState }>()
const emit = defineEmits<{ close: [] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const { items, run } = useSessionMenuItems(() => targetOfTab(tab))
const terminals = useTerminalStore()
const rewind = useRewindStore()
const contextUsage = useContextUsageStore()
const chatSettings = useChatSettingsStore()
const { settings, chipLabel } = useSessionSettings(() => tab)

const runLabel = computed(() =>
  t('composer.settings_summary', {
    model: chipLabel.value,
    mode: t(`chat.modes.${settings.value.mode}`)
  })
)

// The sheet behind the model chip; this one closes first, two sheets never stack.
const openSettings = () => {
  open.value = false
  chatSettings.openModelPicker(tab.id)
}

const openTerminal = () => {
  open.value = false
  terminals.showOrOpenTab({ machine: tab.machine, cwd: tab.cwd })
}

// The phone has no session bar and no ring: rewinding and the context breakdown start here.
const openRewind = () => {
  open.value = false
  rewind.openRewind(tab.id)
}
const openContext = () => {
  open.value = false
  contextUsage.openContext(tab.id)
}

// The sheet makes room for the confirmation or the undo toast that follows.
const act = (action: SessionAction) => {
  open.value = false
  run(action)
}
</script>

<template>
  <NchResponsiveDialog
    v-model:open="open"
    :title="tab.title || t('chat.new_chat')"
    :description="t('chat.phone.menu_hint')"
  >
    <dl class="flex flex-col gap-3 text-small">
      <div class="flex items-center gap-3">
        <dt class="flex w-28 shrink-0 items-center gap-2 text-muted-foreground">
          <FolderOpen class="size-4" aria-hidden="true" />{{ t('chat.folder') }}
        </dt>
        <dd class="min-w-0 flex-1 truncate font-mono text-meta">{{ tab.cwd }}</dd>
      </div>
      <div class="flex items-center gap-3">
        <dt class="flex w-28 shrink-0 items-center gap-2 text-muted-foreground">
          <Sparkles class="size-4" aria-hidden="true" />{{ t('chat.model') }}
        </dt>
        <dd class="min-w-0 flex-1">
          <button
            type="button"
            :aria-label="t('chat.phone.settings_label', { current: runLabel })"
            class="-mx-2 flex min-h-11 w-[calc(100%+1rem)] touch-manipulation items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            @click="openSettings"
          >
            <span class="min-w-0 flex-1 truncate">{{ runLabel }}</span>
            <ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </dd>
      </div>
      <div class="flex items-center gap-3">
        <dt class="flex w-28 shrink-0 items-center gap-2 text-muted-foreground">
          <Bell class="size-4" aria-hidden="true" />{{ t('chat.phone.notifications') }}
        </dt>
        <dd><ChatNotifyToggle /></dd>
      </div>
      <div class="flex items-center gap-3">
        <dt class="flex w-28 shrink-0 items-center gap-2 text-muted-foreground">
          <Moon class="size-4" aria-hidden="true" />{{ t('chat.phone.theme') }}
        </dt>
        <dd><NchThemeToggle /></dd>
      </div>
    </dl>
    <div class="mt-4 flex flex-col gap-4 border-t border-border pt-4">
      <PanelSection :icon="UserRound" :title="t('panel.account')">
        <AccountPicker :tab class="-mx-2.5" />
      </PanelSection>
      <PanelContext :tab />
      <PanelUsage :tab />
    </div>
    <div class="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      <Button
        v-for="item in items"
        :key="item.action"
        :variant="item.isDestructive ? 'destructive' : 'outline'"
        class="h-11 w-full touch-manipulation justify-start"
        @click="act(item.action)"
      >
        <component :is="item.icon" class="size-4" aria-hidden="true" />
        {{ item.label }}
      </Button>
      <Button
        variant="outline"
        class="h-11 w-full touch-manipulation justify-start"
        @click="openTerminal"
      >
        <SquareTerminal class="size-4" aria-hidden="true" />
        {{ t('terminal.in_folder', { folder: folderNameOf(tab.cwd) }) }}
      </Button>
      <Button
        variant="outline"
        class="h-11 w-full touch-manipulation justify-start"
        :disabled="!tab.sessionId || tab.status === 'working' || tab.status === 'asking'"
        @click="openRewind"
      >
        <History class="size-4" aria-hidden="true" />
        {{ t('rewind.title') }}
      </Button>
      <Button
        variant="outline"
        class="h-11 w-full touch-manipulation justify-start"
        @click="openContext"
      >
        <Gauge class="size-4" aria-hidden="true" />
        {{ t('context.open') }}
      </Button>
      <Button
        variant="outline"
        class="h-11 w-full touch-manipulation justify-start"
        @click="emit('close')"
      >
        <X class="size-4" aria-hidden="true" />
        {{ t('chat.close_tab') }}
      </Button>
    </div>
  </NchResponsiveDialog>
</template>
