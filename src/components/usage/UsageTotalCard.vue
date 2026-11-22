<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { sumOfDays, type DayTokens } from '@/utils/usage'

// Today next to the whole range, so the chart's scale has a number to hold on to. The small bars
// show the range day by day, today in the brand colour, and fill the card's height in the row.
// The series ends on today (`dayAxis`), so its last day is today's number and bar.
const { range, series } = defineProps<{ range: number; series: DayTokens[] }>()

const { t } = useI18n()
const format = useUsageFormat()

const today = computed(() => series.at(-1)?.total ?? 0)
const total = computed(() => sumOfDays(series))
const bars = computed(() => {
  const highest = Math.max(...series.map((day) => day.total), 1)
  return series.map((day, index) => ({
    day: day.day,
    height: `${(day.total / highest) * 100}%`,
    isToday: index === series.length - 1
  }))
})
</script>

<template>
  <article class="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
    <div class="grid grid-cols-2 gap-4">
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-small text-muted-foreground">{{ t('usage.today') }}</span>
        <span class="truncate text-display font-semibold tracking-tight">
          {{ format.compact(today) }}
        </span>
      </div>
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-small text-muted-foreground">
          {{ t('usage.range_days', { n: range }) }}
        </span>
        <span class="truncate text-display font-semibold tracking-tight">
          {{ format.compact(total) }}
        </span>
      </div>
    </div>
    <!-- Absolute, so the bar percentages have a definite height also where the card sizes to its
         content (one column on a phone). -->
    <div
      class="relative min-h-12 flex-1"
      role="img"
      :aria-label="t('usage.day_bars_label', { n: range })"
    >
      <div class="absolute inset-0 flex items-end gap-0.5">
        <span
          v-for="bar in bars"
          :key="bar.day"
          class="min-h-0.5 flex-1 rounded-t-sm"
          :class="bar.isToday ? 'bg-brand' : 'bg-brand/30'"
          :style="{ height: bar.height }"
        />
      </div>
    </div>
    <span class="text-meta text-muted-foreground">
      {{ t('usage.tokens') }} · {{ t('usage.tokens_hint') }}
    </span>
  </article>
</template>
