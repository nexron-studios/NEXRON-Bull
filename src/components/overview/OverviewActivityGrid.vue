<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUsageFormat } from '@/composables/useUsageFormat'
import {
  levelBoundsOf,
  levelOf,
  monthStartsOf,
  valueOf,
  type ActivityDay,
  type ActivityLevel,
  type ActivityMetric
} from '@/utils/activityGrid'

// Figma "39 Übersicht": one square per day, a column per week, like GitHub's contribution graph.
// The whole grid is one tab stop; arrow keys move by day and week, hover, focus and a tap open
// the one tooltip, which follows the cell it describes. The squares grow with the card up to a
// cap, so a wide window gets a bigger year but never the fist-sized squares a 4K screen showed;
// the section puts the cards beside each other before the cap leaves a strip (layout.md). The
// section may lower the cap with `--activity-cell-max`. Below their minimum the grid scrolls.
// While the year loads, the same grid stands empty and pulses.
const {
  weeks,
  days,
  metric,
  isPending = false
} = defineProps<{
  weeks: (string | null)[][]
  days: Map<string, ActivityDay>
  metric: ActivityMetric
  isPending?: boolean
}>()

/** Smallest square, GitHub's size; narrower than 53 of them, the grid scrolls. */
const MIN_CELL_PX = 12
/** Largest square while the card has the row to itself; reached just before peers join it. */
const MAX_CELL_PX = 22
/** Grid lines before the weeks: month labels above, weekday labels to the left. */
const HEADER_LINES = 1
/** Rows of the weekday labels: Monday, Wednesday, Friday. */
const LABELED_WEEKDAYS = [0, 2, 4]
const DAYS_PER_WEEK = 7
const LEVEL_CLASS: Record<ActivityLevel, string> = {
  0: 'bg-muted',
  1: 'bg-brand/25',
  2: 'bg-brand/50',
  3: 'bg-brand/75',
  4: 'bg-brand'
}

const activeDay = ref<string | null>(null)
const activeCell = ref<HTMLElement | null>(null)
const tabStopDay = ref<string | null>(null)
const scroller = useTemplateRef<HTMLElement>('scroller')

const { t } = useI18n()
const format = useUsageFormat()

const allDays = computed(() => weeks.flat().filter((day): day is string => day !== null))
const bounds = computed(() =>
  levelBoundsOf(allDays.value.map((day) => valueOf(days.get(day), metric)))
)
const months = computed(() => monthStartsOf(weeks))
const gridStyle = computed(() => ({
  gridTemplateColumns: `auto repeat(${weeks.length}, minmax(${MIN_CELL_PX}px, var(--activity-cell-max, ${MAX_CELL_PX}px)))`
}))
const today = computed(() => allDays.value.at(-1) ?? null)
// After midnight the oldest week may drop out; the tab stop then falls back to today.
const focusDay = computed(() =>
  tabStopDay.value && allDays.value.includes(tabStopDay.value) ? tabStopDay.value : today.value
)
const active = computed(() => (activeDay.value ? days.get(activeDay.value) : undefined))

const levelClassOf = (day: string) =>
  isPending
    ? 'animate-pulse bg-muted'
    : LEVEL_CLASS[levelOf(valueOf(days.get(day), metric), bounds.value)]
const placeOf = (week: number, weekday: number) => ({
  gridColumn: week + HEADER_LINES + 1,
  gridRow: weekday + HEADER_LINES + 1
})
const summaryOf = (day: string) => {
  const entry = days.get(day)
  const f = format.value
  return t('overview.activity.cell_label', {
    day: f.dayLong(day),
    tokens: f.compact(entry?.tokens ?? 0),
    sessions: entry?.sessions ?? 0,
    tools: entry?.tools ?? 0
  })
}
const show = (day: string, event: Event) => {
  if (!(event.currentTarget instanceof HTMLElement)) return
  activeDay.value = day
  activeCell.value = event.currentTarget
}
const hide = (day: string) => {
  if (activeDay.value === day) activeDay.value = null
}
const moveFocus = (event: KeyboardEvent, day: string) => {
  const step = { ArrowLeft: -DAYS_PER_WEEK, ArrowRight: DAYS_PER_WEEK, ArrowUp: -1, ArrowDown: 1 }[
    event.key
  ]
  if (step === undefined || !scroller.value) return
  event.preventDefault()
  const next = allDays.value[allDays.value.indexOf(day) + step]
  if (!next) return
  tabStopDay.value = next
  scroller.value.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus()
}

// On a narrow screen the newest weeks matter most: start scrolled to today.
onMounted(() => {
  if (scroller.value) scroller.value.scrollLeft = scroller.value.scrollWidth
})
</script>

<template>
  <div ref="scroller" class="relative -mx-1 overflow-x-auto px-1 pb-1">
    <div
      class="grid gap-[3px]"
      :style="gridStyle"
      role="group"
      :aria-label="t('overview.activity.grid_label')"
      :aria-busy="isPending"
      :inert="isPending"
    >
      <span
        v-for="start in months"
        :key="start.week"
        class="pb-1.5 text-meta leading-none whitespace-nowrap text-muted-foreground"
        :style="placeOf(start.week, -1)"
        aria-hidden="true"
      >
        {{ format.monthShort(start.month) }}
      </span>
      <span
        v-for="weekday in LABELED_WEEKDAYS"
        :key="weekday"
        class="flex items-center pr-1.5 text-meta text-muted-foreground"
        :style="placeOf(-1, weekday)"
        aria-hidden="true"
      >
        {{ format.weekdayShort(weekday) }}
      </span>
      <template v-for="(week, index) in weeks" :key="index">
        <template v-for="(day, weekday) in week" :key="day ?? `${index}-${weekday}`">
          <button
            v-if="day"
            type="button"
            :data-day="day"
            class="aspect-square w-full touch-manipulation rounded-[3px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="[levelClassOf(day), { 'ring-2 ring-foreground': activeDay === day }]"
            :style="placeOf(index, weekday)"
            :tabindex="day === focusDay ? 0 : -1"
            :aria-label="summaryOf(day)"
            @mouseenter="show(day, $event)"
            @mouseleave="hide(day)"
            @focus="show(day, $event)"
            @blur="hide(day)"
            @click="show(day, $event)"
            @keydown="moveFocus($event, day)"
          />
        </template>
      </template>
    </div>

    <Tooltip :open="activeDay !== null" disable-closing-trigger>
      <TooltipTrigger as-child :reference="activeCell ?? undefined">
        <span class="sr-only" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent v-if="activeDay" side="top" class="flex-col items-stretch gap-1 py-2">
        <span class="opacity-70">{{ format.dayLong(activeDay) }}</span>
        <span class="text-small font-semibold tabular-nums">
          {{
            t('overview.activity.cell_headline', {
              tokens: format.compact(active?.tokens ?? 0),
              sessions: active?.sessions ?? 0
            })
          }}
        </span>
        <span v-if="active?.tools" class="tabular-nums opacity-70">
          {{ t('overview.activity.cell_tools', { n: active.tools }) }}
        </span>
        <span v-if="active?.projects.length" class="font-mono opacity-70">
          {{ format.list(active.projects) }}
        </span>
      </TooltipContent>
    </Tooltip>
  </div>
</template>
