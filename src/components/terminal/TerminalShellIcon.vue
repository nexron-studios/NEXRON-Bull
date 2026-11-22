<script setup lang="ts">
import { SquareTerminal } from '@lucide/vue'
import bashIcon from '@/assets/shells/bash.svg'
import cmdIcon from '@/assets/shells/cmd.png'
import powershellIcon from '@/assets/shells/powershell.png'
import pwshIcon from '@/assets/shells/pwsh.png'
import type { TerminalShellChoice } from '@/utils/terminalPreferences'

// The shell's own logo (Figma "Shell icon"). `auto` or `null` (not started yet, or a shell on
// another machine) has no logo to show and keeps the Lucide terminal. The caller sets the size.
const { shell } = defineProps<{ shell: TerminalShellChoice | null }>()

const SHELL_ICONS = {
  pwsh: pwshIcon,
  powershell: powershellIcon,
  cmd: cmdIcon,
  bash: bashIcon
} as const
</script>

<template>
  <img
    v-if="shell && shell !== 'auto'"
    :src="SHELL_ICONS[shell]"
    alt=""
    draggable="false"
    class="shrink-0 select-none"
  />
  <SquareTerminal v-else class="shrink-0" aria-hidden="true" />
</template>
