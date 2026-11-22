import { computed } from 'vue'
import { useIntervalFn, useNow } from '@vueuse/core'
import { useUsageHistory } from '@/composables/useUsageHistory'
import { dayKeyOf } from '@/utils/usage'
import {
  ACTIVITY_DAYS,
  RECENT_DAYS,
  activeDayCountOf,
  activityDaysOf,
  activityWeeksOf,
  dayBefore,
  recentProjectsOf,
  recentToolsOf,
  streaksOf,
  totalsOf
} from '@/utils/activityGrid'

/** The grid changes by the day; a minute keeps "today" right after midnight. */
const TODAY_TICK_MS = 60 * 1000

/** Noon, so the day never slips into its neighbour around a time-zone change. */
const dateOfDay = (day: string): Date => new Date(`${day}T12:00:00`)

/**
 * A year of use for the overview's activity grid: tokens, sessions and tool calls per day on
 * every machine, plus the projects and tools of the last month.
 */
export const useActivity = () => {
  const now = useNow({ scheduler: (tick) => useIntervalFn(tick, TODAY_TICK_MS) })
  const { usage, isPending, isError } = useUsageHistory(ACTIVITY_DAYS)

  // A key, not the Date: the grid rebuilds once a day, not on every tick.
  const today = computed(() => dayKeyOf(now.value))
  const weeks = computed(() => activityWeeksOf(dateOfDay(today.value)))
  const axis = computed(() => weeks.value.flat().filter((day): day is string => day !== null))
  const days = computed(() => activityDaysOf(usage.value))
  const streaks = computed(() => streaksOf(days.value, axis.value))
  const activeDays = computed(() => activeDayCountOf(days.value, axis.value))
  const totals = computed(() => totalsOf(days.value, axis.value))
  const recentFirstDay = computed(() => dayBefore(dateOfDay(today.value), RECENT_DAYS))
  const projects = computed(() => recentProjectsOf(usage.value, recentFirstDay.value))
  const tools = computed(() => recentToolsOf(usage.value, recentFirstDay.value))

  return {
    weeks,
    axis,
    days,
    streaks,
    activeDays,
    totals,
    projects,
    tools,
    isPending,
    isError
  }
}
