<script setup lang="ts">
import { computed } from 'vue'
import { Activity } from '@lucide/vue'
import { useRouteQuery } from '@vueuse/router'
import { useI18n } from 'vue-i18n'
import NchRangeSwitch from '@/components/common/NchRangeSwitch.vue'
import { Skeleton } from '@/components/ui/skeleton'
import OverviewActivityGrid from '@/components/overview/OverviewActivityGrid.vue'
import { useHasOtherMachines } from '@/composables/useAgentdCatalog'
import { useUsageFormat } from '@/composables/useUsageFormat'
import {
  activityMetricList,
  parseActivityMetric,
  peakDayOf,
  type ActivityDay,
  type ActivityMetric
} from '@/utils/activityGrid'

// Figma "39 Übersicht": a year of work at a glance, with the numbers GitHub puts beside it.
// What the squares count (tokens, sessions, tool calls) lives in the URL like the other filters.
const { days, axis, streaks, activeDays, isError } = defineProps<{
  weeks: (string | null)[][]
  axis: string[]
  days: Map<string, ActivityDay>
  streaks: { current: number; longest: number }
  activeDays: number
  totals: { tokens: number; sessions: number }
  isPending: boolean
  isError: boolean
}>()

const STAT_KEYS = ['active_days', 'streak', 'peak'] as const

const metric = useRouteQuery<string, ActivityMetric>('activity', 'tokens', {
  transform: { get: parseActivityMetric, set: String }
})

const { t } = useI18n()
const hasOtherMachines = useHasOtherMachines()
const format = useUsageFormat()

const metricOptions = computed(() =>
  activityMetricList.map((value) => ({ value, label: t(`overview.activity.metrics.${value}`) }))
)
const peak = computed(() => peakDayOf(days, axis, metric.value))
const peakValue = computed(() => {
  if (!peak.value) return ''
  const value = peak.value[metric.value]
  return t(
    `overview.activity.peak_values.${metric.value}`,
    { value: format.value.compact(value), n: value },
    value
  )
})
// Beside the grid, GitHub's three numbers. A failed load shows a dash, not a false zero.
const stats = computed(() => {
  if (isError) return STAT_KEYS.map((key) => ({ key, value: '–', note: '' }))
  return [
    {
      key: 'active_days',
      value: String(activeDays),
      note: t('overview.activity.of_days', { n: axis.length })
    },
    {
      key: 'streak',
      value: t('overview.activity.days', streaks.current),
      note: t('overview.activity.longest', { n: streaks.longest }, streaks.longest)
    },
    {
      key: 'peak',
      value: peak.value ? format.value.dayMedium(peak.value.day) : '–',
      note: peakValue.value
    }
  ]
})
</script>

<template>
  <!-- No container of its own: beside its peers the card takes the grid's natural width, which a
       container (sized from outside, never from its content) cannot. The page's width decides
       whether the numbers stand beside the grid or below it. -->
  <section
    class="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    aria-labelledby="overview-activity"
  >
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-0.5">
        <h2 id="overview-activity" class="flex items-center gap-2 text-body font-semibold">
          <Activity class="size-4 text-muted-foreground" aria-hidden="true" />
          {{ t('overview.activity.title') }}
        </h2>
        <div class="text-small text-muted-foreground">
          <Skeleton v-if="isPending" class="h-5 w-72 max-w-full" />
          <span v-else-if="isError" class="motion-shake inline-block">
            {{ t('overview.activity.error') }}
          </span>
          <span v-else class="motion-fade-in">
            {{
              t(
                hasOtherMachines ? 'overview.activity.summary' : 'overview.activity.summary_single',
                {
                  sessions: format.exact(totals.sessions),
                  tokens: format.compact(totals.tokens)
                }
              )
            }}
          </span>
        </div>
      </div>
      <NchRangeSwitch
        v-model="metric"
        :options="metricOptions"
        :label="t('overview.activity.metric_label')"
      />
    </header>

    <div class="flex flex-col gap-5 @4xl:flex-row @4xl:items-center @4xl:gap-8">
      <!-- As wide as the capped grid, narrower when the card is: the numbers follow right after
           it instead of across an empty strip. -->
      <div class="flex min-w-0 flex-initial flex-col gap-2">
        <OverviewActivityGrid :weeks :days :metric :is-pending />
        <p
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-meta text-muted-foreground"
        >
          <span>{{ t(`overview.activity.legend.${metric}`) }}</span>
          <span class="flex items-center gap-1" aria-hidden="true">
            {{ t('overview.activity.less') }}
            <span class="size-3 rounded-[3px] bg-muted" />
            <span class="size-3 rounded-[3px] bg-brand/25" />
            <span class="size-3 rounded-[3px] bg-brand/50" />
            <span class="size-3 rounded-[3px] bg-brand/75" />
            <span class="size-3 rounded-[3px] bg-brand" />
            {{ t('overview.activity.more') }}
          </span>
        </p>
      </div>

      <dl class="grid shrink-0 grid-cols-3 gap-4 @4xl:w-40 @4xl:grid-cols-1">
        <div v-for="stat in stats" :key="stat.key" class="flex min-w-0 flex-col">
          <dt class="text-meta text-muted-foreground">{{ t(`overview.activity.${stat.key}`) }}</dt>
          <template v-if="isPending">
            <dd><Skeleton class="my-1 h-6 w-16" /></dd>
            <dd><Skeleton class="h-3.5 w-20" /></dd>
          </template>
          <template v-else>
            <dd class="motion-fade-in truncate text-title font-semibold tabular-nums">
              {{ stat.value }}
            </dd>
            <dd class="motion-fade-in truncate text-meta text-muted-foreground tabular-nums">
              {{ stat.note }}
            </dd>
          </template>
        </div>
      </dl>
    </div>
  </section>
</template>
