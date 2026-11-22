<script setup lang="ts">
import { computed } from 'vue'
import { Check, ChevronDown, Ellipsis, Eraser, Plus, RotateCcw, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import TerminalShellIcon from '@/components/terminal/TerminalShellIcon.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTerminalLabels } from '@/composables/useTerminalLabels'
import { useTerminalSessions } from '@/composables/useTerminalSessions'
import { useTerminalShells } from '@/composables/useTerminalShells'
import { useTerminalStore } from '@/stores/terminals'
import type { TerminalEntry } from '@/utils/terminalEntry'

// The bar above a terminal tab (Figma "23"): which shell, where, and what to do with it.
const { entry } = defineProps<{ entry: TerminalEntry }>()

const { t } = useI18n()
const store = useTerminalStore()
const { titleOf, shellLabelOf, pathOf } = useTerminalLabels()
const { sessionOf } = useTerminalSessions()
const { data: shells } = useTerminalShells()

const session = computed(() => sessionOf(entry))
// Another machine logs in to its own shell; there is nothing to pick.
const canPickShell = computed(() => !entry.machine && (shells.value?.length ?? 0) > 1)

const openSibling = () =>
  store.openTab({ machine: entry.machine, cwd: entry.cwd, title: entry.title })
</script>

<template>
  <div class="flex h-10 shrink-0 items-center gap-2 border-b border-border pr-3 pl-5">
    <TerminalShellIcon :shell="entry.machine ? null : entry.shell" class="size-4 text-subtle" />
    <DropdownMenu v-if="canPickShell" :modal="false">
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="sm" class="-ml-2 h-7 gap-1 px-2 text-small font-semibold">
          {{ shellLabelOf(entry) }}
          <ChevronDown class="size-3 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-auto min-w-48">
        <DropdownMenuLabel class="text-meta text-muted-foreground">
          {{ t('terminal.restart_with') }}
        </DropdownMenuLabel>
        <DropdownMenuItem v-for="shell in shells" :key="shell" @select="session.restart(shell)">
          <TerminalShellIcon :shell class="size-4" />
          <span class="flex-1">{{ t(`settings.terminal.shells.${shell}`) }}</span>
          <Check v-if="shell === entry.shell" class="text-muted-foreground" aria-hidden="true" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <span v-else class="shrink-0 text-small font-semibold">{{ shellLabelOf(entry) }}</span>
    <span class="min-w-0 flex-1 truncate font-mono text-meta text-muted-foreground">
      <span class="sr-only">{{ titleOf(entry) }}:</span>
      {{ pathOf(entry) }}
    </span>
    <NchIconButton :label="t('terminal.new')" size="icon-sm" @click="openSibling">
      <Plus class="size-4" aria-hidden="true" />
    </NchIconButton>
    <NchIconButton :label="t('terminal.clear')" size="icon-sm" @click="session.clear()">
      <Eraser class="size-4" aria-hidden="true" />
    </NchIconButton>
    <DropdownMenu :modal="false">
      <DropdownMenuTrigger as-child>
        <NchIconButton :label="t('terminal.menu')" size="icon-sm">
          <Ellipsis class="size-4" aria-hidden="true" />
        </NchIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-auto min-w-48">
        <DropdownMenuItem @select="session.restart()">
          <RotateCcw aria-hidden="true" />
          {{ t('terminal.restart') }}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" @select="store.close(entry.id)">
          <X aria-hidden="true" />
          {{ t('terminal.close') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
