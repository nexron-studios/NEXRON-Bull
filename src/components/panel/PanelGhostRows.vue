<script setup lang="ts">
import { computed } from 'vue'
import { TOOL_ICON } from '@/utils/toolIcons'
import { toolInfoOf } from '@/utils/toolKind'

// What the activity list will look like before the first tool ran (Figma 42e): three faint rows
// of typical calls. While the turn runs, the first one shimmers. Decoration only.
const { isLive = false } = defineProps<{ isLive?: boolean }>()

/** A read, a change, a command: the three kinds a turn usually starts with, fading out. */
const GHOST_ROWS = [
  { tool: 'Read', width: 'w-[70%]', opacity: 'opacity-70' },
  { tool: 'Edit', width: 'w-[52%]', opacity: 'opacity-45' },
  { tool: 'Bash', width: 'w-[62%]', opacity: 'opacity-25' }
] as const

const rows = computed(() =>
  GHOST_ROWS.map((row, index) => ({
    ...row,
    info: toolInfoOf(row.tool),
    isSweeping: isLive && index === 0
  }))
)
</script>

<template>
  <div
    class="flex flex-col rounded-lg border border-dashed border-input px-2.5 py-1"
    aria-hidden="true"
  >
    <div
      v-for="row in rows"
      :key="row.tool"
      class="flex items-center gap-2 py-1.5"
      :class="row.opacity"
    >
      <component :is="TOOL_ICON[row.info.icon]" class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="relative h-1.5 overflow-hidden rounded-full bg-accent" :class="row.width">
        <span
          v-if="row.isSweeping"
          class="absolute inset-0 animate-ghost-sweep bg-linear-to-r from-transparent via-input to-transparent"
        />
      </span>
      <span class="ml-auto h-1.5 w-5.5 shrink-0 rounded-full bg-accent" />
    </div>
  </div>
</template>
