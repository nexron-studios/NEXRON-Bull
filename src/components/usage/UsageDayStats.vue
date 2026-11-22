<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUsageFormat } from '@/composables/useUsageFormat'
import type { DayStats } from '@/utils/dayChart'

// The three numbers the chart is about, above it, so the scale has something to hold on to.
// The average carries the dashed key of its reference line in the plot.
defineProps<{ stats: DayStats }>()

const { t } = useI18n()
const format = useUsageFormat()
</script>

<template>
  <dl class="grid grid-cols-3 gap-3 sm:flex sm:gap-10">
    <div class="flex min-w-0 flex-col gap-0.5">
      <dt class="text-meta text-muted-foreground">{{ t('usage.total') }}</dt>
      <dd class="truncate text-body font-semibold sm:text-title">
        {{ format.compact(stats.total) }}
      </dd>
    </div>
    <div class="flex min-w-0 flex-col gap-0.5">
      <dt class="flex items-center gap-1.5 text-meta text-muted-foreground">
        <span
          class="w-3 shrink-0 border-t border-dashed border-muted-foreground"
          aria-hidden="true"
        />
        <span class="truncate">{{ t('usage.average_per_day') }}</span>
      </dt>
      <dd class="truncate text-body font-semibold sm:text-title">
        {{ format.compact(stats.average) }}
      </dd>
    </div>
    <div v-if="stats.peak" class="flex min-w-0 flex-col gap-0.5">
      <dt class="text-meta text-muted-foreground">{{ t('usage.peak_day') }}</dt>
      <dd class="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
        <span class="text-body font-semibold sm:text-title">
          {{ format.compact(stats.peak.value) }}
        </span>
        <span class="truncate text-meta text-muted-foreground">
          {{ format.dayMedium(stats.peak.day) }}
        </span>
      </dd>
    </div>
  </dl>
</template>
