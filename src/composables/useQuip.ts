import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import {
  pickQuip,
  quipPoolOf,
  shouldReplaceQuip,
  type QuipMood,
  type ShownQuip
} from '@/utils/quips'

/**
 * The quip the thinking bar shows; `null` while there is no mood. `now` is the bar's stopwatch
 * clock, so quips change on its ticks and need no timer of their own.
 */
export const useQuip = (
  mood: MaybeRefOrGetter<QuipMood | null>,
  isLongTurn: MaybeRefOrGetter<boolean>,
  now: MaybeRefOrGetter<Date>
) => {
  const shown = ref<ShownQuip | null>(null)

  const motion = usePreferredReducedMotion()

  const quip = computed(() => shown.value?.text ?? null)

  watch(
    [() => toValue(mood), () => toValue(now)],
    ([current, at]) => {
      if (!current) {
        shown.value = null
        return
      }
      const time = at.getTime()
      if (!shouldReplaceQuip(shown.value, current, time, motion.value !== 'reduce')) return
      const pool = quipPoolOf(current, toValue(isLongTurn))
      shown.value = { text: pickQuip(pool, quip.value), mood: current, shownAt: time }
    },
    { immediate: true }
  )

  return { quip }
}
