<script setup lang="ts">
import TerminalBar from '@/components/terminal/TerminalBar.vue'
import TerminalView from '@/components/terminal/TerminalView.vue'
import type { TerminalEntry } from '@/utils/terminalEntry'

// A terminal as a tab of its own (Figma "23"): it takes the place of the chat and its panel.
defineProps<{ entry: TerminalEntry }>()
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col" data-route-content>
    <TerminalBar :entry />
    <TerminalView :key="entry.id" :entry is-auto-focused />
  </section>
</template>
