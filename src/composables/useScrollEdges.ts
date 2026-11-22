import { computed, type MaybeRefOrGetter } from 'vue'
import { useMounted, useResizeObserver, useScroll } from '@vueuse/core'

/**
 * Whether a scroll area holds more content above and below what it shows: where a bar at that edge
 * casts its shadow (`NchScrollEdge`), or a list fades out. Measured again when its content or its
 * size changes, not only on scroll, so a list that grows or a window that shrinks shows it at once.
 */
export const useScrollEdges = (target: MaybeRefOrGetter<HTMLElement | null | undefined>) => {
  const { y, arrivedState, measure } = useScroll(target, { observe: { mutation: true } })
  useResizeObserver(target, () => measure())
  // `arrivedState` starts as "more below" before anything is measured: without this a short list
  // would mount with its bottom edge fading out.
  const isMounted = useMounted()

  const hasMoreAbove = computed(() => isMounted.value && !arrivedState.top)
  const hasMoreBelow = computed(() => isMounted.value && !arrivedState.bottom)

  return { y, hasMoreAbove, hasMoreBelow }
}
