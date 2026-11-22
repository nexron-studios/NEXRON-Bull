<script setup lang="ts">
import { computed } from 'vue'
import { Maximize2, Plus, X } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import TerminalDrawerHandle from '@/components/terminal/TerminalDrawerHandle.vue'
import TerminalShellIcon from '@/components/terminal/TerminalShellIcon.vue'
import TerminalView from '@/components/terminal/TerminalView.vue'
import { useTerminalLabels } from '@/composables/useTerminalLabels'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { TERMINAL_DRAWER_CHORD } from '@/utils/shortcuts'
import { useTerminalStore } from '@/stores/terminals'
import type { TerminalRequest } from '@/stores/terminalRequests'

// Terminals under a chat (Figma "23b"), opened with Ctrl+`: the chat stays readable above. Each
// chat has its own drawer with its own shells, in the chat's folder.
const { chatId, here } = defineProps<{ chatId: string; here: TerminalRequest }>()

const { t } = useI18n()
const { labelOf, ariaOf } = useShortcutLabels()
const store = useTerminalStore()
const { drawerHeight } = storeToRefs(store)
const { drawerLabelOf } = useTerminalLabels()

const drawer = computed(() => store.drawerOf(chatId))
const entries = computed(() => store.drawerTerminalsOf(chatId))
const shown = computed(
  () => entries.value.find((entry) => entry.id === drawer.value.activeId) ?? entries.value.at(-1)
)

const hide = () => store.toggleDrawer(chatId, here)
</script>

<template>
  <section
    v-if="drawer.isOpen && shown"
    class="relative flex shrink-0 flex-col border-t border-border bg-background"
    :style="{ height: `${drawerHeight}px` }"
    :aria-label="t('terminal.drawer')"
  >
    <TerminalDrawerHandle v-model:height="drawerHeight" />
    <div class="flex h-9 shrink-0 items-center gap-1 border-b border-border pr-2 pl-4">
      <div class="flex min-w-0 scrollbar-none items-center gap-1 overflow-x-auto" role="tablist">
        <div
          v-for="(entry, index) in entries"
          :key="entry.id"
          class="group/ttab flex shrink-0 items-center rounded-md"
          :class="entry.id === shown.id ? 'bg-muted text-foreground' : 'text-muted-foreground'"
        >
          <button
            type="button"
            role="tab"
            class="flex items-center gap-1.5 py-1 pr-1 pl-2 text-meta"
            :aria-selected="entry.id === shown.id"
            @click="store.showInDrawer(chatId, entry.id)"
          >
            <TerminalShellIcon :shell="entry.machine ? null : entry.shell" class="size-3.5" />
            {{ drawerLabelOf(entry, index) }}
          </button>
          <NchIconButton
            :label="t('terminal.close')"
            size="icon-xs"
            class="mr-0.5 size-5 opacity-0 group-focus-within/ttab:opacity-100 group-hover/ttab:opacity-100"
            @click="store.close(entry.id)"
          >
            <X class="size-3" aria-hidden="true" />
          </NchIconButton>
        </div>
      </div>
      <NchIconButton
        :label="t('terminal.new')"
        size="icon-xs"
        @click="store.openInDrawer(chatId, here)"
      >
        <Plus class="size-3.5" aria-hidden="true" />
      </NchIconButton>
      <span class="flex-1" />
      <kbd class="font-sans text-meta text-muted-foreground" aria-hidden="true">
        {{ labelOf(TERMINAL_DRAWER_CHORD) }}
      </kbd>
      <NchIconButton
        :label="t('terminal.maximize')"
        size="icon-xs"
        @click="store.maximize(shown.id)"
      >
        <Maximize2 class="size-3.5" aria-hidden="true" />
      </NchIconButton>
      <NchIconButton
        :label="t('terminal.hide_drawer')"
        size="icon-xs"
        :aria-keyshortcuts="ariaOf(TERMINAL_DRAWER_CHORD)"
        @click="hide"
      >
        <X class="size-3.5" aria-hidden="true" />
      </NchIconButton>
    </div>
    <TerminalView :key="shown.id" :entry="shown" is-auto-focused />
  </section>
</template>
