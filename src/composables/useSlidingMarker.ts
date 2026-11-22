import { nextTick, onMounted, ref, watch, type Ref, type WatchSource } from 'vue'
import { usePreferredReducedMotion, useResizeObserver } from '@vueuse/core'
import { markerGlideOf, type MarkerBox } from '@/utils/motion'

/** Fallbacks only: the spring lives in motion.css as `--ease-spring-smooth`. */
const GLIDE_MS_FALLBACK = 280
const GLIDE_EASING_FALLBACK = 'cubic-bezier(0.2, 0, 0, 1)'

/**
 * One marker that glides to the pressed choice of a segmented control (motion.md "Sliding
 * marker"). The choices differ in width, so the marker takes the new box at once and a FLIP
 * animation of `transform` carries it over from where it was drawn, also mid-glide. The Web
 * Animations API is not reached by the reduced-motion CSS block, hence the explicit check.
 */
export const useSlidingMarker = (
  group: Readonly<Ref<HTMLElement | null>>,
  marker: Readonly<Ref<HTMLElement | null>>,
  selected: WatchSource<unknown>
) => {
  const box = ref<MarkerBox | null>(null)
  let running: Animation | null = null
  const motion = usePreferredReducedMotion()

  const pressedBox = (): MarkerBox | null => {
    const button = group.value?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!button || !button.offsetWidth) return null
    return { x: button.offsetLeft, width: button.offsetWidth }
  }
  // Where the marker is drawn right now, which is mid-way while a glide still runs.
  const drawnBox = (): MarkerBox | null => {
    if (!group.value || !marker.value) return null
    const drawn = marker.value.getBoundingClientRect()
    if (!drawn.width) return null
    return { x: drawn.left - group.value.getBoundingClientRect().left, width: drawn.width }
  }
  const measure = () => {
    box.value = pressedBox()
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

  return { box }
}
