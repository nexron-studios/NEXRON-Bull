<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TerminalShellIcon from '@/components/terminal/TerminalShellIcon.vue'
import {
  TERMINAL_PREVIEW_PROMPT,
  type TerminalShell,
  type TerminalShellChoice
} from '@/utils/terminalPreferences'

// A terminal as Bull draws it, in the chosen shell and font size, so both choices show before a
// terminal is opened. Sample output only; nothing runs.
defineProps<{ shell: TerminalShellChoice | TerminalShell; fontSize: number }>()

const { t } = useI18n()
</script>

<template>
  <figure class="flex min-w-0 flex-col gap-2">
    <figcaption class="text-meta text-muted-foreground">
      {{ t('settings.terminal.preview') }}
    </figcaption>
    <div
      class="flex min-h-56 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background"
      aria-hidden="true"
    >
      <div class="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-muted/60 px-3">
        <TerminalShellIcon :shell class="size-4" />
        <span class="truncate text-meta">{{ t(`settings.terminal.shells.${shell}`) }}</span>
      </div>
      <pre
        class="flex-1 overflow-x-auto px-3 py-2.5 font-mono leading-relaxed text-muted-foreground"
        :style="{ fontSize: `${fontSize}px` }"
      ><span class="text-code-keyword">{{ TERMINAL_PREVIEW_PROMPT[shell] }}</span> <span class="text-foreground">git status --short</span>
 M src/views/SettingsView.vue
?? src/utils/terminalPreferences.ts
<span class="text-code-keyword">{{ TERMINAL_PREVIEW_PROMPT[shell] }}</span> <span class="text-foreground">npm test</span>
<span class="text-good">✓</span> 86 files, 640 tests passed
<span class="text-code-keyword">{{ TERMINAL_PREVIEW_PROMPT[shell] }}</span> <span class="inline-block h-[1.1em] w-[0.6em] translate-y-[0.15em] bg-muted-foreground" /></pre>
    </div>
  </figure>
</template>
