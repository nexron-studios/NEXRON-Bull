<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NchRangeSwitch from '@/components/common/NchRangeSwitch.vue'
import UsageDayPlot from '@/components/usage/UsageDayPlot.vue'
import UsageDayStats from '@/components/usage/UsageDayStats.vue'
import UsageDayTable from '@/components/usage/UsageDayTable.vue'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { modelFamilyList, type ModelFamily } from '@/types/agentd.type'
import { dayStatsOf, type ChartFocus } from '@/utils/dayChart'
import type { DayTokens } from '@/utils/usage'

// Tokens per day: the range's numbers above, the columns below. The model switch doubles as the
// legend and puts one model on its own scale, because a small model is a sliver next to Opus.
// With a single model the legend takes the switch's place and height (its own row on a phone), so
// the loading skeleton fits either header.
const { days } = defineProps<{ days: DayTokens[] }>()

const focus = ref<ChartFocus>('all')

const { t } = useI18n()
const format = useUsageFormat()

// Only the models used in the range: a switch to an empty model would show an empty chart.
const families = computed<ModelFamily[]>(() =>
  modelFamilyList.filter((family) => days.some((day) => day.byFamily[family]))
)
const stats = computed(() => dayStatsOf(days, focus.value))
const focusOptions = computed<{ value: ChartFocus; label: string }[]>(() => [
  { value: 'all', label: t('usage.all_models') },
  ...families.value.map((family) => ({ value: family, label: t(`usage.models.${family}`) }))
])
const chartLabel = computed(() =>
  t('usage.chart_label', {
    from: format.value.dayLong(days[0]?.day ?? ''),
    to: format.value.dayLong(days.at(-1)?.day ?? '')
  })
)

// A model that drops out with a new range hands the chart back to all models for good, so it
// does not come back by itself in a later range. Synchronous, so no frame plots an empty model.
watch(
  families,
  (list) => {
    if (focus.value !== 'all' && !list.includes(focus.value)) focus.value = 'all'
  },
  { flush: 'sync' }
)
</script>

<template>
  <section class="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-4 sm:p-5">
    <header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div class="flex flex-col">
        <h2 class="text-body font-semibold">{{ t('usage.tokens_per_day') }}</h2>
        <span class="text-meta text-muted-foreground">{{ t('usage.tokens_hint') }}</span>
      </div>
      <NchRangeSwitch
        v-if="families.length > 1"
        v-model="focus"
        :options="focusOptions"
        :label="t('usage.model_switch_label')"
      />
      <span
        v-else-if="families[0]"
        class="flex min-h-8 w-full items-center gap-1.5 text-small text-muted-foreground sm:w-auto"
      >
        {{ t(`usage.models.${families[0]}`) }}
      </span>
    </header>

    <UsageDayStats :stats />
    <UsageDayPlot :days :focus :families :average="stats.average" :label="chartLabel" />
    <UsageDayTable :days :families :caption="chartLabel" />
  </section>
</template>
