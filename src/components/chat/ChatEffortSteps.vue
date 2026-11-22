<script setup lang="ts">
import { computed } from 'vue'
import { effortList, type Effort } from '@/utils/sessionSettings'

// The effort as ascending bars filled up to the level (Figma "37", "33"): one bar per level
// Claude Code knows, so xhigh and max read apart where lucide's signal icons have only four.
const {
  effort,
  on = 'bg-current',
  off = 'bg-current/25'
} = defineProps<{ effort: Effort; on?: string; off?: string }>()

const STEP_HEIGHTS_PX = [4, 6, 8, 10, 13]

const filled = computed(() => effortList.indexOf(effort) + 1)
</script>

<template>
  <span class="flex h-[13px] shrink-0 items-end gap-[1.5px]" aria-hidden="true">
    <span
      v-for="(height, index) in STEP_HEIGHTS_PX"
      :key="height"
      class="w-[2.5px] rounded-[1px]"
      :class="index < filled ? on : off"
      :style="{ height: `${height}px` }"
    />
  </span>
</template>
