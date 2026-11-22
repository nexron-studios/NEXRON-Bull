<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

// Rows in the shape of `OverviewDoneRow`: badge, title, age, continue. While the lists load, and
// at the end of the list while more rows wait to be rendered.
const { rows } = defineProps<{ rows: number }>()
</script>

<template>
  <div class="divide-y divide-border rounded-xl border bg-card" aria-hidden="true">
    <div v-for="row in rows" :key="row" class="flex items-center gap-3 px-4 py-3.5">
      <Skeleton class="size-4 shrink-0 rounded-full" />
      <Skeleton class="h-3 w-2/5 rounded-full" />
      <Skeleton class="ml-auto h-2.5 w-16 rounded-full" />
      <Skeleton class="h-8 w-24 rounded-lg" />
    </div>
  </div>
</template>
