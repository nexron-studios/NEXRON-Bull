<script setup lang="ts">
import { computed } from 'vue'
import { MessagesSquare, Monitor, Plus, Server, SquareTerminal } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useMachines } from '@/composables/useAgentdCatalog'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { NEW_SESSION_CHORD, NEW_TERMINAL_CHORD } from '@/utils/shortcuts'
import { useTerminalStore } from '@/stores/terminals'
import type { TerminalRequest } from '@/stores/terminalRequests'
import { folderNameOf } from '@/utils/sessionList'

// The "+" of the tab bar (Figma "23"): a new chat as before, or a terminal: in the shown chat's
// folder, or in the home folder of another machine.
const { here } = defineProps<{ here: TerminalRequest }>()
const emit = defineEmits<{ newChat: [] }>()

const { t } = useI18n()
const { labelOf } = useShortcutLabels()
const store = useTerminalStore()
const { data: hosts } = useMachines()

const hereLabel = computed(() => {
  const folder = folderNameOf(here.cwd)
  return folder ? t('terminal.in_folder', { folder }) : t('terminal.here')
})
// Every machine but the one "here" already covers; this PC too when the chat runs elsewhere.
const others = computed(() =>
  [null, ...(hosts.value ?? [])].filter((machine) => machine !== here.machine)
)
</script>

<template>
  <DropdownMenu :modal="false">
    <DropdownMenuTrigger as-child>
      <NchIconButton :label="t('terminal.new_tab')" size="icon-sm">
        <Plus class="size-4" aria-hidden="true" />
      </NchIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-80">
      <DropdownMenuItem @select="emit('newChat')">
        <MessagesSquare aria-hidden="true" />
        {{ t('chat.new_chat') }}
        <DropdownMenuShortcut class="pl-3 tracking-normal whitespace-nowrap">{{
          labelOf(NEW_SESSION_CHORD)
        }}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="store.openTab(here)">
        <SquareTerminal aria-hidden="true" />
        <span class="truncate">{{ hereLabel }}</span>
        <DropdownMenuShortcut class="pl-3 tracking-normal whitespace-nowrap">{{
          labelOf(NEW_TERMINAL_CHORD)
        }}</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        v-for="machine in others"
        :key="machine ?? ''"
        @select="store.openTab({ machine, cwd: '' })"
      >
        <component :is="machine ? Server : Monitor" aria-hidden="true" />
        <span class="truncate">
          {{ t('terminal.on_machine', { machine: machine ?? t('chat.this_machine') }) }}
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
