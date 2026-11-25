import { nextTick, onMounted, ref, watch, type Ref, type WatchSource } from 'vue'
import { usePreferredReducedMotion, useResizeObserver } from '@vueuse/core'
import { layoutLeftOf, markerGlideOf, type MarkerBox } from '@/utils/motion'

/** Fallbacks only: the spring lives in motion.css as `--ease-spring-smooth`. */
const GLIDE_MS_FALLBACK = 280
const GLIDE_EASING_FALLBACK = 'cubic-bezier(0.2, 0, 0, 1)'

// Item boxes are read in fractional px: `offsetLeft` and `offsetWidth` round to whole ones, which
// left the marker up to a pixel off the item's edges under a UI zoom.

/** The width as laid out, without a transform. */
const usedWidthOf = (el: HTMLElement): number =>
  Number.parseFloat(getComputedStyle(el).width) || el.offsetWidth

/** Where an element is laid out, in viewport px, read off its drawn box and transform. */
const laidOutLeftOf = (el: HTMLElement): number => {
  const style = getComputedStyle(el)
  const { a: scale, e: shift } = new DOMMatrixReadOnly(style.transform)
  return layoutLeftOf({
    drawnLeft: el.getBoundingClientRect().left,
    shift,
    scale,
    origin: Number.parseFloat(style.transformOrigin)
  })
}

/**
 * One marker that glides to the pressed choice of a segmented control (motion.md "Sliding
 * marker"). The choices differ in width, so the marker takes the new box at once and a FLIP
 * animation of `transform` carries it over from where it was drawn, also mid-glide. The Web
 * Animations API is not reached by the reduced-motion CSS block, hence the explicit check.
 * `target` finds the item the marker sits under. The marker stays rendered (`invisible`, not
 * `hidden` or `v-if`) while there is no box: the item is measured against it.
 */
export const useSlidingMarker = (
  group: Readonly<Ref<HTMLElement | null>>,
  marker: Readonly<Ref<HTMLElement | null>>,
  selected: WatchSource<unknown>,
  target: () => HTMLElement | null = () =>
    group.value?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? null
) => {
  const box = ref<MarkerBox | null>(null)
  let running: Animation | null = null
  const motion = usePreferredReducedMotion()

  const targetBox = (): MarkerBox | null => {
    const item = target()
    if (!marker.value || !item?.offsetWidth) return null
    // Against the marker's own resting place, so the group's scroll and border need no reading.
    return { x: laidOutLeftOf(item) - laidOutLeftOf(marker.value), width: usedWidthOf(item) }
  }
  // Where the marker is drawn right now, which is mid-way while a glide still runs. Read from its
  // own transform, so a scrolled group does not shift it.
  const drawnBox = (): MarkerBox | null => {
    if (!marker.value?.offsetWidth) return null
    const { a: scale, e: x } = new DOMMatrixReadOnly(getComputedStyle(marker.value).transform)
    return { x, width: scale * usedWidthOf(marker.value) }
  }
  const measure = () => {
    box.value = targetBox()
  }
  const glide = async () => {
    const from = drawnBox()
    running?.cancel()
    await nextTick()
    measure()
    if (!box.value || !marker.value || motion.value === 'reduce') return
    const keyframes = markerGlideOf(from, box.value)
    if (!keyframes) return
    const style = getComputedStyle(marker.value)
    const duration =
      Number.parseFloat(style.getPropertyValue('--duration-spring-smooth')) || GLIDE_MS_FALLBACK
    const easing = style.getPropertyValue('--ease-spring-smooth').trim() || GLIDE_EASING_FALLBACK
    running = marker.value.animate(keyframes, { duration, easing })
  }

  watch(selected, () => void glide())
  // Labels change with the language and the fonts load late: the box follows the group's size.
  useResizeObserver(group, measure)

  onMounted(measure)

  return { box, measure }
}
