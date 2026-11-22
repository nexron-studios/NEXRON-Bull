<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

// The shapes of the usage page while agentd answers (Figma M16), so nothing jumps when data lands.
defineProps<{ kind: 'quota' | 'chart' | 'rows' | 'table' }>()

/** Bar heights of the placeholder chart, in percent: a calm, uneven skyline. */
const BAR_HEIGHTS = [38, 62, 30, 78, 54, 46, 22, 44, 70, 84, 52, 60, 88, 56]
/** The project list: five projects and the rest, in two columns where there is room. */
const ROWS = 6
const TABLE_ROWS = 2
/** Total, daily average and peak day above the chart. */
const STATS = 3
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4"
    :class="{ 'sm:p-5': kind !== 'quota' }"
    aria-hidden="true"
  >
    <template v-if="kind === 'quota'">
      <Skeleton class="h-5 w-2/5" />
      <Skeleton class="mt-1 h-1.5 w-full rounded-full" />
      <Skeleton class="h-1.5 w-full rounded-full" />
      <Skeleton class="h-4 w-1/3" />
    </template>
    <template v-else-if="kind === 'chart'">
      <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <Skeleton class="h-5 w-32" />
        <Skeleton class="h-8 w-full rounded-lg sm:w-56" />
      </div>
      <div class="mt-2 grid grid-cols-3 gap-3 sm:flex sm:gap-10">
        <div v-for="stat in STATS" :key="stat" class="flex flex-col gap-1.5">
          <Skeleton class="h-3 w-16" />
          <Skeleton class="h-5 w-20" />
        </div>
      </div>
      <div class="mt-2 ml-14 flex h-50 items-end pb-6 sm:h-62">
        <div
          v-for="(height, index) in BAR_HEIGHTS"
          :key="index"
          class="flex h-full min-w-0 flex-1 items-end justify-center"
        >
          <Skeleton
            class="w-3/5 max-w-14 min-w-1 rounded-b-none"
            :style="{ height: `${height}%` }"
          />
        </div>
      </div>
    </template>
    <template v-else-if="kind === 'rows'">
      <Skeleton class="h-5 w-32" />
      <div class="grid gap-x-10 gap-y-3 @4xl:grid-flow-col @4xl:grid-cols-2 @4xl:grid-rows-3">
        <div v-for="row in ROWS" :key="row" class="flex flex-col gap-1.5 py-1">
          <Skeleton class="h-4 w-1/2" />
          <Skeleton class="h-1.5 w-full rounded-full" />
        </div>
      </div>
    </template>
    <template v-else>
      <Skeleton class="h-5 w-40" />
      <Skeleton class="h-4 w-full" />
      <Skeleton v-for="row in TABLE_ROWS" :key="row" class="h-6 w-full" />
    </template>
  </div>
</template>
