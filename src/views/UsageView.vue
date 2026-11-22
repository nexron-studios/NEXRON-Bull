<script setup lang="ts">
import { computed } from 'vue'
import { ChartNoAxesColumn, CircleAlert, RefreshCw } from '@lucide/vue'
import { useIntervalFn, useNow } from '@vueuse/core'
import { useRouteQuery } from '@vueuse/router'
import { useI18n } from 'vue-i18n'
import NchEmpty from '@/components/common/NchEmpty.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchRangeSwitch from '@/components/common/NchRangeSwitch.vue'
import { Button } from '@/components/ui/button'
import UsageDayChart from '@/components/usage/UsageDayChart.vue'
import UsageMachineTable from '@/components/usage/UsageMachineTable.vue'
import UsageProjectList from '@/components/usage/UsageProjectList.vue'
import UsageQuotaSection from '@/components/usage/UsageQuotaSection.vue'
import UsageSkeleton from '@/components/usage/UsageSkeleton.vue'
import UsageTotalCard from '@/components/usage/UsageTotalCard.vue'
import { useHasOtherMachines } from '@/composables/useAgentdCatalog'
import { useQuota } from '@/composables/useQuota'
import { useUsageHistory } from '@/composables/useUsageHistory'
import {
  DEFAULT_USAGE_RANGE,
  dayAxis,
  parseUsageRange,
  projectShares,
  sumOfDays,
  tokensPerDay,
  tokensPerMachine,
  usageRangeList,
  withinDays,
  type UsageRange
} from '@/utils/usage'

/** Reset countdowns and "today" move on once a minute. */
const CLOCK_MS = 60 * 1000

const { t } = useI18n()
const hasOtherMachines = useHasOtherMachines()
const range = useRouteQuery<string, UsageRange>('days', String(DEFAULT_USAGE_RANGE), {
  transform: { get: parseUsageRange, set: String }
})
const now = useNow({ scheduler: (tick) => useIntervalFn(tick, CLOCK_MS) })
const {
  accounts,
  isPending: isQuotaPending,
  isError: isQuotaError,
  isFetching: isQuotaFetching,
  refresh: refreshQuota
} = useQuota()
const { usage, isPending, isError, isPlaceholder, loadingMachines, failedMachines, refetch } =
  useUsageHistory(range)

const rangeOptions = computed(() =>
  usageRangeList.map((n) => ({
    value: n,
    label: t('usage.range_days', { n }),
    shortLabel: t('usage.range_days_short', { n })
  }))
)
// Every figure reads the same days: while a new range loads, or when a machine in another time
// zone sends a day outside the axis, the cards still agree with the chart.
const axis = computed(() => dayAxis(range.value, now.value))
const inRange = computed(() => withinDays(usage.value, axis.value))
const days = computed(() => tokensPerDay(inRange.value, axis.value))
const rangeTotal = computed(() => sumOfDays(days.value))
const projects = computed(() => projectShares(inRange.value))
const machines = computed(() => tokensPerMachine(inRange.value))
const machineNote = computed(() => {
  const failed = failedMachines.value
  if (failed.length) return t('usage.machines_failed', { machines: failed.join(', ') })
  const loading = loadingMachines.value
  return loading.length ? t('usage.machines_loading', { machines: loading.join(', ') }) : null
})

const refresh = () => void refreshQuota()
const retryUsage = () => void refetch()
</script>

<template>
  <main class="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
    <!-- A dashboard fills the width (layout.md); the page is a container, so its sections pick
         their columns from the room the sidebar leaves, not from the window. -->
    <div
      class="@container flex min-h-full shrink-0 flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-10 sm:py-8"
    >
      <header class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
          <h1 class="text-title font-semibold sm:text-display">{{ t('usage.title') }}</h1>
          <p class="hidden text-small text-muted-foreground sm:block">
            {{ hasOtherMachines ? t('usage.subtitle') : t('usage.subtitle_single') }}
          </p>
        </div>
        <div class="flex items-center gap-1.5">
          <NchIconButton
            :label="t('usage.refresh')"
            :disabled="isQuotaFetching"
            class="motion-press"
            @click="refresh"
          >
            <RefreshCw :class="{ 'animate-spin': isQuotaFetching }" aria-hidden="true" />
          </NchIconButton>
          <NchRangeSwitch v-model="range" :options="rangeOptions" :label="t('usage.range_label')" />
        </div>
      </header>

      <!-- Account cards and the total are peers: as many side by side as fit, equally high. -->
      <div class="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-3 sm:gap-4">
        <UsageQuotaSection
          :accounts
          :isPending="isQuotaPending"
          :isError="isQuotaError"
          :now="now.getTime()"
          @retry="refresh"
        />
        <UsageSkeleton v-if="isPending" kind="quota" />
        <UsageTotalCard
          v-else-if="!isError"
          class="motion-stagger"
          :style="{ '--stagger-index': accounts.length }"
          :range
          :series="days"
        />
      </div>

      <template v-if="isPending">
        <span class="sr-only" role="status">{{ t('usage.loading') }}</span>
        <UsageSkeleton kind="chart" />
        <UsageSkeleton kind="rows" />
        <UsageSkeleton kind="table" />
      </template>
      <NchEmpty
        v-else-if="isError"
        class="motion-shake"
        :icon="CircleAlert"
        :title="t('usage.error_title')"
        :hint="t('usage.error_hint')"
      >
        <Button class="motion-press" variant="outline" @click="retryUsage">{{
          t('usage.retry')
        }}</Button>
      </NchEmpty>
      <NchEmpty
        v-else-if="rangeTotal === 0"
        :icon="ChartNoAxesColumn"
        :title="t('usage.empty_title')"
        :hint="t('usage.empty_hint')"
      />
      <div
        v-else
        class="motion-fade-in flex flex-col gap-3 transition-opacity duration-150 sm:gap-4"
        :class="{ 'opacity-60': isPlaceholder }"
      >
        <!-- Chart, projects and machines each take the full row: the projects split into two
             columns where there is room, so neither card is left half empty beside the other. -->
        <UsageDayChart :days />
        <UsageProjectList :projects />
        <UsageMachineTable v-if="hasOtherMachines" :machines />
      </div>
      <p v-if="machineNote" class="text-meta text-muted-foreground">{{ machineNote }}</p>
    </div>
  </main>
</template>
