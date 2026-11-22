import { toValue, watch, type MaybeRefOrGetter } from 'vue'
import { createSharedComposable, useIntervalFn, useNow } from '@vueuse/core'
import { MS_PER_SECOND } from '@/utils/elapsed'

/** Countdowns to a quota reset show minutes; a tick every 30 s keeps them within one. */
const MINUTE_CLOCK_TICK_MS = 30 * MS_PER_SECOND

/** The clock of every reset countdown: one interval for the whole app, however many ask. */
export const useMinuteClock = createSharedComposable(() =>
  useNow({ scheduler: (tick) => useIntervalFn(tick, MINUTE_CLOCK_TICK_MS) })
)

/** A clock for stopwatches that ticks every second, but only while `isRunning`. */
export const useSecondClock = (isRunning: MaybeRefOrGetter<boolean>) => {
  const { now, pause, resume } = useNow({
    controls: true,
    scheduler: (tick) =>
      useIntervalFn(tick, MS_PER_SECOND, { immediate: false, immediateCallback: true })
  })
  watch(
    () => toValue(isRunning),
    (isNowRunning) => (isNowRunning ? resume() : pause()),
    { immediate: true }
  )
  return now
}
