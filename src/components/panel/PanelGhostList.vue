<script setup lang="ts">
import { computed } from 'vue'

// What a list of the panel will look like before it has rows (connectors, changed files): faint
// rows of a mark, a name and a value, fading out. It holds about the height of the list, so the
// section does not jump when the rows come in. While they load, the first one shimmers.
// Decoration only.
const { count = 3, isLive = false } = defineProps<{ count?: number; isLive?: boolean }>()

const NAME_WIDTHS = ['w-[64%]', 'w-[48%]', 'w-[56%]', 'w-[40%]', 'w-[52%]']
const OPACITIES = ['opacity-70', 'opacity-55', 'opacity-40', 'opacity-30', 'opacity-20']

const rows = computed(() =>
  Array.from({ length: count }, (_, index) => ({
    width: NAME_WIDTHS[index % NAME_WIDTHS.length],
    opacity: OPACITIES[Math.min(index, OPACITIES.length - 1)],
    isSweeping: isLive && index === 0
  }))
)
</script>

<template>
  <div
    class="flex flex-col rounded-lg border border-dashed border-input px-2.5 py-0.5"
    aria-hidden="true"
  >
    <div
      v-for="(row, index) in rows"
      :key="index"
      class="flex h-7 items-center gap-2"
      :class="row.opacity"
    >
      <span class="size-1.5 shrink-0 rounded-full bg-input" />
      <span class="relative h-1.5 overflow-hidden rounded-full bg-accent" :class="row.width">
        <span
          v-if="row.isSweeping"
          class="absolute inset-0 animate-ghost-sweep bg-linear-to-r from-transparent via-input to-transparent"
        />
      </span>
      <span class="ml-auto h-1.5 w-9 shrink-0 rounded-full bg-accent" />
    </div>
  </div>
</template>
