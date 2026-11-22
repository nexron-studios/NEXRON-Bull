<script setup lang="ts">
import { computed } from 'vue'
import { SquareTerminal } from '@lucide/vue'
import bashIcon from '@/assets/shells/bash.svg'
import cmdIcon from '@/assets/shells/cmd.png'
import powershellIcon from '@/assets/shells/powershell.png'
import pwshIcon from '@/assets/shells/pwsh.png'
import type { TerminalShell, TerminalShellChoice } from '@/utils/terminalPreferences'

// The shell's own logo (Figma "Shell icon"). `auto`, the login shell (zsh, bash or fish: Bull
// does not ask which) or `null` (not started yet, or a shell on another machine) has no logo to
// show and keeps the Lucide terminal. The caller sets the size.
const { shell } = defineProps<{ shell: TerminalShellChoice | TerminalShell | null }>()

const SHELL_ICONS: Record<TerminalShell, string | null> = {
  pwsh: pwshIcon,
  powershell: powershellIcon,
  cmd: cmdIcon,
  bash: bashIcon,
  login: null
}

const icon = computed(() => (shell && shell !== 'auto' ? SHELL_ICONS[shell] : null))
</script>

<template>
  <img v-if="icon" :src="icon" alt="" draggable="false" class="shrink-0 select-none" />
  <SquareTerminal v-else class="shrink-0" aria-hidden="true" />
</template>
