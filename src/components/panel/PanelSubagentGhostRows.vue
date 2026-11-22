<script setup lang="ts">
import { Bot } from '@lucide/vue'

// What the subagent list will look like before Claude hands off work: two faint agents, each with
// its type chip, a title and a line of what it does below, fading out. It holds about the height
// of one or two real agents, so the panel below moves less when the first one starts.
// Decoration only.
const GHOST_AGENTS = [
  { title: 'w-[58%]', action: 'w-[46%]', opacity: 'opacity-60' },
  { title: 'w-[44%]', action: 'w-[52%]', opacity: 'opacity-30' }
] as const
</script>

<template>
  <div
    class="flex flex-col gap-2.5 rounded-lg border border-dashed border-input px-2.5 py-2"
    aria-hidden="true"
  >
    <div
      v-for="agent in GHOST_AGENTS"
      :key="agent.title"
      class="flex flex-col gap-1.5"
      :class="agent.opacity"
    >
      <div class="flex h-5 items-center gap-2">
        <span class="size-4 shrink-0 rounded-full border-2 border-input" />
        <span class="flex h-4 shrink-0 items-center gap-1 rounded-sm bg-muted px-1.5">
          <Bot class="size-3 text-subtle" />
          <span class="h-1.5 w-7 rounded-full bg-accent" />
        </span>
        <span class="h-1.5 rounded-full bg-accent" :class="agent.title" />
        <span class="ml-auto h-1.5 w-5.5 shrink-0 rounded-full bg-accent" />
      </div>
      <div class="flex h-4 items-center gap-2 pl-6">
        <span class="h-1.5 rounded-full bg-accent/70" :class="agent.action" />
      </div>
    </div>
  </div>
</template>
