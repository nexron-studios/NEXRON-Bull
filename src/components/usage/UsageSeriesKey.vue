<script setup lang="ts">
import type { ModelFamily } from '@/types/agentd.type'
import { SERIES_BG_CLASS } from '@/utils/usage'

// The colour of a model next to its name: a square for bars and legends, a short line in tooltips.
defineProps<{ family: ModelFamily; shape?: 'square' | 'line' }>()
</script>

<template>
  <span
    aria-hidden="true"
    class="inline-block shrink-0"
    :class="[
      shape === 'line' ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-[3px]',
      SERIES_BG_CLASS[family]
    ]"
  />
</template>
