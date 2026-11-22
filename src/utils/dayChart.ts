import type { ModelFamily } from '@/types/agentd.type'
import type { DayTokens } from '@/utils/usage'

/** What the day chart plots: all models together, or one model on its own scale. */
export type ChartFocus = 'all' | ModelFamily

export interface AxisTicks {
  /** The value at the top of the plot, the last tick */
  top: number
  /** From 0 up to `top`, evenly spaced */
  ticks: number[]
}

export interface DayStats {
  total: number
  /** Over every day of the range, idle days included, in whole tokens */
  average: number
  /** The busiest day; `null` when nothing was used */
  peak: { day: string; value: number } | null
}

const NICE_STEPS = [1, 2, 2.5, 5, 10]
/** About this many gridlines above the baseline. */
const TICK_TARGET = 4

// Steps stay whole tokens: a range with a handful of tokens gets 0, 1, 2, 3, never 0.5 or 2.5.
const niceStepOf = (rough: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step =
    NICE_STEPS.find((n) => n * magnitude >= rough && Number.isInteger(n * magnitude)) ?? 10
  return Math.max(1, step * magnitude)
}

/** Round gridlines for values up to `max`: `1.5e9` → 0, 500 M, 1 B, 1.5 B. */
export const axisTicksOf = (max: number, target = TICK_TARGET): AxisTicks => {
  if (max <= 0) return { top: 0, ticks: [0] }
  const step = niceStepOf(max / target)
  const count = Math.ceil(max / step)
  const ticks = Array.from({ length: count + 1 }, (_, index) => index * step)
  return { top: count * step, ticks }
}

/** The value of one day under the chart's focus. */
export const valueOf = (day: DayTokens, focus: ChartFocus): number =>
  focus === 'all' ? day.total : day.byFamily[focus]

export const dayStatsOf = (days: DayTokens[], focus: ChartFocus): DayStats => {
  const values = days.map((day) => valueOf(day, focus))
  const total = values.reduce((sum, value) => sum + value, 0)
  const average = days.length ? Math.round(total / days.length) : 0
  const peakIndex = values.reduce((best, value, index) => (value > values[best] ? index : best), 0)
  const peak = total > 0 ? { day: days[peakIndex].day, value: values[peakIndex] } : null
  return { total, average, peak }
}

/**
 * Pixel height of a bar: true to scale, but a day with any use stays visible next to a
 * dominating one.
 */
export const barHeightOf = (value: number, top: number, plotPx: number, minPx: number): number => {
  if (value <= 0 || top <= 0) return 0
  return Math.max(minPx, (value / top) * plotPx)
}

/** The bar a key moves the focus to, or `null` for any other key. */
export const nextBarOf = (key: string, index: number, count: number): number | null => {
  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, index - 1)
    case 'ArrowRight':
      return Math.min(count - 1, index + 1)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
