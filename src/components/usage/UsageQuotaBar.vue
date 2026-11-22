<script setup lang="ts">
import { computed } from 'vue'
import { ALL_PERCENT, leftPercentOf, percentWidth } from '@/utils/percent'
import { METER_LEVEL_CLASS, meterLevelOf } from '@/utils/quota'

// The bar of one quota window. It shows what is left, so it empties as the window fills (the user
// found a full bar for a spent quota backwards); brand while there is room, warning from 80 % used,
// critical from 95 % used.
// `isOnPopover`: muted is the popover's own colour there, so the track takes the input line.
const {
  label,
  usedPercent,
  isOnPopover = false
} = defineProps<{ label: string; usedPercent: number; isOnPopover?: boolean }>()

const left = computed(() => leftPercentOf(usedPercent))
const fillClass = computed(() => METER_LEVEL_CLASS[meterLevelOf(usedPercent)].fill)
</script>

<template>
  <div
    class="h-1.5 overflow-hidden rounded-full"
    :class="isOnPopover ? 'bg-input' : 'bg-muted'"
    role="meter"
    :aria-label="label"
    aria-valuemin="0"
    :aria-valuemax="ALL_PERCENT"
    :aria-valuenow="Math.round(left)"
  >
    <div class="h-full rounded-full" :class="fillClass" :style="{ width: percentWidth(left) }" />
  </div>
</template>
