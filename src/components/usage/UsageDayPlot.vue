<script setup lang="ts">
import {
  computed,
  ref,
  shallowReactive,
  useTemplateRef,
  watch,
  type ComponentPublicInstance
} from 'vue'
import { useElementSize } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import UsageSeriesKey from '@/components/usage/UsageSeriesKey.vue'
import { useUsageFormat } from '@/composables/useUsageFormat'
import type { ModelFamily } from '@/types/agentd.type'
import { axisTicksOf, barHeightOf, nextBarOf, valueOf, type ChartFocus } from '@/utils/dayChart'
import { labelStepOf, type DayTokens } from '@/utils/usage'

// One column per day, true to scale on round gridlines, with the range average as a dashed
// reference line. One colour per bar (Figma "40 Nutzung"): the models are in the tooltip and the
// table, a stack of three thin slices read as noise (19.11.2026). Hover, keyboard focus and a tap open the same tooltip; the arrow keys move
// between days, so the whole chart is one tab stop.
const { days, focus, families, average } = defineProps<{
  days: DayTokens[]
  focus: ChartFocus
  /** The models used in the range, in legend order */
  families: ModelFamily[]
  average: number
  label: string
}>()

/** About this many day labels fit under the chart on a phone and on a desktop. */
const PHONE_LABELS = 5
const DESKTOP_LABELS = 15
/** A day with any use stays visible next to one that dominates the scale. */
const MIN_BAR_PX = 4
/** No day takes the tab stop yet: it clamps to today. */
const TODAY_TAB_STOP = Number.MAX_SAFE_INTEGER

const activeDay = ref<string | null>(null)
// The day that takes the tab stop.
const focusIndex = ref(TODAY_TAB_STOP)
const plot = useTemplateRef<HTMLElement>('plot')
// The painted bar of each day, so its tooltip sits on the bar instead of the column top.
const barMarks = shallowReactive(new Map<string, HTMLElement>())

const { t } = useI18n()
const format = useUsageFormat()
const { height: plotPx } = useElementSize(plot)

const axis = computed(() => axisTicksOf(Math.max(0, ...days.map((day) => valueOf(day, focus)))))
const columns = computed(() =>
  days.map((day) => {
    const value = valueOf(day, focus)
    const height = barHeightOf(value, axis.value.top, plotPx.value, MIN_BAR_PX)
    const parts = partsOf(day)
    return {
      day,
      height,
      parts,
      headline: format.value.compact(value),
      label: barLabelOf(day, value, parts)
    }
  })
)
const tabStop = computed(() => Math.min(focusIndex.value, days.length - 1))
const phoneStep = computed(() => labelStepOf(days.length, PHONE_LABELS))
const desktopStep = computed(() => labelStepOf(days.length, DESKTOP_LABELS))

const bottomOf = (value: number) => (axis.value.top ? `${(value / axis.value.top) * 100}%` : '0%')
const isToday = (index: number) => index === days.length - 1
// Counted from the newest day, so today always carries a label.
const isLabelShown = (index: number, step: number) => (days.length - 1 - index) % step === 0
const partsOf = (day: DayTokens) =>
  families.filter((f) => day.byFamily[f]).map((f) => ({ family: f, value: day.byFamily[f] }))
const barLabelOf = (day: DayTokens, value: number, parts: ReturnType<typeof partsOf>) => {
  const f = format.value
  const list = f.list(parts.map((p) => `${t(`usage.models.${p.family}`)} ${f.compact(p.value)}`))
  if (focus === 'all')
    return t('usage.bar_label', {
      day: f.dayLong(day.day),
      total: f.compact(day.total),
      parts: list
    })
  return t('usage.bar_label_model', {
    day: f.dayLong(day.day),
    value: f.compact(value),
    model: t(`usage.models.${focus}`),
    total: f.compact(day.total)
  })
}
const setActive = (day: string, isOpen: boolean) => {
  if (isOpen) activeDay.value = day
  else if (activeDay.value === day) activeDay.value = null
}
const keepBarMark = (day: string, el: Element | ComponentPublicInstance | null) => {
  if (el instanceof HTMLElement) barMarks.set(day, el)
  else barMarks.delete(day)
}
const moveFocus = (event: KeyboardEvent, index: number) => {
  const next = nextBarOf(event.key, index, days.length)
  if (next === null || !plot.value) return
  event.preventDefault()
  plot.value.querySelectorAll<HTMLButtonElement>('[data-bar]')[next].focus()
}

// A new range starts the tab stop on today again.
watch(
  () => days.length,
  () => (focusIndex.value = TODAY_TAB_STOP)
)
</script>

<template>
  <div class="mt-2 ml-14 flex flex-col gap-2">
    <div ref="plot" class="relative h-44 sm:h-56">
      <div
        v-for="tick in axis.ticks"
        :key="tick"
        class="pointer-events-none absolute inset-x-0 h-px bg-border"
        :style="{ bottom: bottomOf(tick) }"
        aria-hidden="true"
      >
        <span
          class="absolute right-full mr-2 -translate-y-1/2 text-meta whitespace-nowrap text-muted-foreground tabular-nums"
        >
          {{ format.compact(tick) }}
        </span>
      </div>

      <div class="absolute inset-0 flex" role="group" :aria-label="label">
        <Tooltip
          v-for="(column, index) in columns"
          :key="column.day.day"
          :open="activeDay === column.day.day"
          disable-closing-trigger
          @update:open="(isOpen: boolean) => setActive(column.day.day, isOpen)"
        >
          <TooltipTrigger as-child :reference="barMarks.get(column.day.day)">
            <button
              type="button"
              data-bar
              class="group relative flex h-full min-w-0 flex-1 touch-manipulation items-end justify-center outline-none"
              :tabindex="index === tabStop ? 0 : -1"
              :aria-label="column.label"
              @click="activeDay = column.day.day"
              @focus="focusIndex = index"
              @keydown="moveFocus($event, index)"
            >
              <span
                class="absolute inset-x-px inset-y-0 rounded-md bg-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-visible:ring-3 group-focus-visible:ring-ring/50 sm:inset-x-1"
                :class="{ 'opacity-100': activeDay === column.day.day }"
                aria-hidden="true"
              />
              <span
                :ref="(el) => keepBarMark(column.day.day, el)"
                class="relative w-3/5 max-w-6 min-w-1 rounded-t-[4px] bg-brand"
                :style="{ height: `${column.height}px` }"
                aria-hidden="true"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" class="flex-col items-stretch gap-1.5 py-2">
            <span class="opacity-70">{{ format.dayLong(column.day.day) }}</span>
            <span class="text-small font-semibold tabular-nums">
              {{ column.headline }} {{ t('usage.tokens') }}
              <template v-if="focus !== 'all'">{{ t(`usage.models.${focus}`) }}</template>
            </span>
            <span v-if="focus !== 'all'" class="tabular-nums opacity-70">
              {{ t('usage.of_total', { total: format.compact(column.day.total) }) }}
            </span>
            <span v-for="part in column.parts" :key="part.family" class="flex items-center gap-2">
              <UsageSeriesKey :family="part.family" shape="line" />
              <span class="font-semibold tabular-nums">{{ format.compact(part.value) }}</span>
              <span class="opacity-70">{{ t(`usage.models.${part.family}`) }}</span>
            </span>
          </TooltipContent>
        </Tooltip>
      </div>

      <div
        v-if="average > 0"
        class="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground"
        :style="{ bottom: bottomOf(average) }"
        aria-hidden="true"
      />
    </div>

    <div class="flex" aria-hidden="true">
      <span
        v-for="(day, index) in days"
        :key="day.day"
        class="flex min-w-0 flex-1 justify-center text-meta whitespace-nowrap tabular-nums"
        :class="isToday(index) ? 'font-medium text-foreground' : 'text-muted-foreground'"
      >
        <template v-if="isToday(index)">{{ t('usage.today') }}</template>
        <template v-else>
          <span v-if="isLabelShown(index, phoneStep)" class="sm:hidden">
            {{ format.dayShort(day.day) }}
          </span>
          <span v-if="isLabelShown(index, desktopStep)" class="hidden sm:inline">
            {{ format.dayShort(day.day) }}
          </span>
        </template>
      </span>
    </div>
  </div>
</template>
