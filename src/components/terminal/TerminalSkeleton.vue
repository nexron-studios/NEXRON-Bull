<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
import { TERMINAL_LINE_HEIGHT } from '@/utils/terminal'

// The shape of a shell that is starting: a banner, a blank line and a prompt with a still cursor,
// on the terminal's own rows, so the first output lands where the skeleton stood. Purely visual:
// TerminalView announces the start.
defineProps<{ fontSize: number }>()

/** Widths in characters, about as wide as a shell banner and prompt */
const BANNER_WIDTHS = ['w-[24ch]', 'w-[40ch]']
const PROMPT_WIDTH = 'w-[30ch]'
</script>

<template>
  <div
    class="pointer-events-none font-mono"
    :style="{ fontSize: `${fontSize}px`, lineHeight: TERMINAL_LINE_HEIGHT }"
    aria-hidden="true"
  >
    <div v-for="width in BANNER_WIDTHS" :key="width" class="flex h-lh items-center">
      <Skeleton class="h-[0.7em] max-w-full rounded-sm" :class="width" />
    </div>
    <div class="h-lh" />
    <div class="flex h-lh items-center gap-[1ch]">
      <Skeleton class="h-[0.7em] max-w-[calc(100%-2ch)] rounded-sm" :class="PROMPT_WIDTH" />
      <span class="h-[1.1em] w-[1ch] shrink-0 bg-foreground/25" />
    </div>
  </div>
</template>
