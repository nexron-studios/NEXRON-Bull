<script setup lang="ts">
// One progress bar for the update dialog and the sidebar card. `ratio` null means no share is
// known yet: a segment travels the bar instead.
const { ratio, isDone = false } = defineProps<{
  ratio: number | null
  label: string
  isDone?: boolean
}>()
</script>

<template>
  <div
    class="overflow-hidden rounded-full bg-border"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="ratio === null ? undefined : Math.round(ratio * 100)"
  >
    <div
      v-if="ratio === null"
      class="h-full w-1/3 animate-update-indeterminate rounded-full bg-brand"
    />
    <div
      v-else
      class="h-full origin-left rounded-full transition-transform duration-200 ease-out"
      :class="isDone ? 'bg-good' : 'bg-brand'"
      :style="{ transform: `scaleX(${ratio})` }"
    />
  </div>
</template>
