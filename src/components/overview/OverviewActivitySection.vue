<script setup lang="ts">
import OverviewActivityCard from '@/components/overview/OverviewActivityCard.vue'
import OverviewProjectsCard from '@/components/overview/OverviewProjectsCard.vue'
import OverviewToolsCard from '@/components/overview/OverviewToolsCard.vue'
import { useActivity } from '@/composables/useActivity'

// Figma "39 Übersicht": between what runs and what is done, what the year and the last month
// went into. One query for all three cards. The page is the container: the year has a row to
// itself until the squares reach their cap; wider, it keeps its natural width with smaller
// squares and the month's cards take the rest of the row, first one, then both (layout.md).
// The breakpoints are where the capped grid (16 px squares, about 79 rem with its numbers) leaves
// each peer about 24 rem.
const { weeks, axis, days, streaks, activeDays, totals, projects, tools, isPending, isError } =
  useActivity()
</script>

<template>
  <div
    class="grid gap-4 @3xl:grid-cols-2 @[104rem]:grid-cols-[auto_minmax(0,1fr)] @[130rem]:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]"
  >
    <OverviewActivityCard
      class="@3xl:col-span-2 @[104rem]:col-span-1 @[104rem]:[--activity-cell-max:16px]"
      :weeks
      :days
      :streaks
      :active-days
      :axis
      :totals
      :is-pending
      :is-error
    />
    <OverviewProjectsCard :projects :is-pending :is-error />
    <OverviewToolsCard
      class="@[104rem]:col-span-2 @[130rem]:col-span-1"
      :tools
      :is-pending
      :is-error
    />
  </div>
</template>
