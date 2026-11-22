<script setup lang="ts">
import OverviewActivityCard from '@/components/overview/OverviewActivityCard.vue'
import OverviewProjectsCard from '@/components/overview/OverviewProjectsCard.vue'
import OverviewToolsCard from '@/components/overview/OverviewToolsCard.vue'
import { useActivity } from '@/composables/useActivity'

// Figma "39 Übersicht": between what runs and what is done, what the year and the last month
// went into. One query for all three cards.
const { weeks, axis, days, streaks, activeDays, totals, projects, tools, isPending, isError } =
  useActivity()
</script>

<template>
  <div class="flex flex-col gap-4">
    <OverviewActivityCard :weeks :days :streaks :active-days :axis :totals :is-pending :is-error />
    <!-- Peers side by side once the page has room for both; the page is the container. -->
    <div class="grid gap-4 @3xl:grid-cols-2">
      <OverviewProjectsCard :projects :is-pending :is-error />
      <OverviewToolsCard :tools :is-pending :is-error />
    </div>
  </div>
</template>
