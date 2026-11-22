<script setup lang="ts">
import type { Component } from 'vue'

// An empty section (Figma 42e): small tile, short title, one line on what happens next, maybe an
// action below. Left-aligned and small, unlike the centred NchEmpty of a view. Used by the panel's
// sections and the sidebar's groups.
// A host on a muted surface (the phone sheet) sets `--section-tile` so the tile still stands out.
const {
  icon,
  title,
  hint,
  tone = 'muted'
} = defineProps<{
  icon: Component
  title: string
  hint: string | null
  /** `good`: a finished state on a card (a turn that only answered), not a placeholder. */
  tone?: 'muted' | 'good'
}>()

const TONE_CLASS = {
  muted: { box: '', tile: 'bg-(--section-tile,var(--muted)) text-muted-foreground' },
  good: {
    box: 'rounded-lg border border-border bg-card p-2.5',
    tile: 'bg-good/12 text-good'
  }
} as const
</script>

<template>
  <!-- The tile sits centred beside title and hint; with an action below it stays at the title, so
       it does not float between the text and the button. Read in render: slots are not reactive. -->
  <div
    class="flex gap-2.5"
    :class="[$slots.default ? 'items-start' : 'items-center', TONE_CLASS[tone].box]"
  >
    <span class="grid size-8 shrink-0 place-items-center rounded-lg" :class="TONE_CLASS[tone].tile">
      <component :is="icon" class="size-4" aria-hidden="true" />
    </span>
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <p class="text-small font-semibold">{{ title }}</p>
      <p v-if="hint" class="text-meta text-muted-foreground">{{ hint }}</p>
      <slot />
    </div>
  </div>
</template>
