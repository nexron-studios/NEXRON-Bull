import { nextTick, onMounted, ref, shallowRef, watch, type Ref, type WatchSource } from 'vue'
import { usePreferredReducedMotion, useResizeObserver } from '@vueuse/core'
import { isSameMarkerBox, layoutLeftOf, markerGlideOf, type MarkerBox } from '@/utils/motion'

/** Fallbacks only: the spring lives in motion.css as `--ease-spring-smooth`. */
const GLIDE_MS_FALLBACK = 280
const GLIDE_EASING_FALLBACK = 'cubic-bezier(0.2, 0, 0, 1)'

// Item boxes are read in fractional px: `offsetLeft` and `offsetWidth` round to whole ones, which
// left the marker up to a pixel off the item's edges under a UI zoom.

/** The width as laid out, without a transform. */
const usedWidthOf = (el: HTMLElement): number =>
  Number.parseFloat(getComputedStyle(el).width) || el.offsetWidth

/**
 * Screen px per layout px inside `el`: below 1 while an ancestor scales it, such as a dialog
 * opening with `zoom-in-95`. That scale fires no ResizeObserver, so it is divided out instead.
 */
const drawnScaleOf = (el: HTMLElement): number => {
  const width = usedWidthOf(el)
  return width ? el.getBoundingClientRect().width / width : 1
}

/** Where an element is laid out, in layout px, read off its drawn box and transform. */
const laidOutLeftOf = (el: HTMLElement, drawnScale: number): number => {
  const style = getComputedStyle(el)
  const { a: scale, e: shift } = new DOMMatrixReadOnly(style.transform)
  return layoutLeftOf({
    drawnLeft: el.getBoundingClientRect().left / drawnScale,
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
 * `skipNext` before a change of `selected` the user already saw happen (a drag): the marker then
 * takes its new place at once instead of gliding after the item.
 */
export const useSlidingMarker = (
  group: Readonly<Ref<HTMLElement | null>>,
  marker: Readonly<Ref<HTMLElement | null>>,
  selected: WatchSource<unknown>,
  target: () => HTMLElement | null = () =>
    group.value?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? null
) => {
  const box = ref<MarkerBox | null>(null)
  // The item the box was last taken from, resolved after a render, so a new or re-created item
  // is the one observed.
  const measured = shallowRef<HTMLElement | null>(null)
  let running: Animation | null = null
  let isSkipping = false
  const motion = usePreferredReducedMotion()

  const targetBox = (item: HTMLElement | null): MarkerBox | null => {
    if (!group.value || !marker.value || !item?.offsetWidth) return null
    const drawnScale = drawnScaleOf(group.value)
    // Against the marker's own resting place, so the group's scroll and border need no reading.
    return {
      x: laidOutLeftOf(item, drawnScale) - laidOutLeftOf(marker.value, drawnScale),
      width: usedWidthOf(item)
    }
  }
  // Where the marker is drawn right now, which is mid-way while a glide still runs. Read from its
  // own transform, so a scrolled or scaled group does not shift it.
  const drawnBox = (): MarkerBox | null => {
    if (!marker.value?.offsetWidth) return null
    const { a: scale, e: x } = new DOMMatrixReadOnly(getComputedStyle(marker.value).transform)
    return { x, width: scale * usedWidthOf(marker.value) }
  }
  const slide = (from: MarkerBox | null, to: MarkerBox) => {
    running?.cancel()
    running = null
    if (!marker.value || motion.value === 'reduce') return
    const keyframes = markerGlideOf(from, to)
    if (!keyframes) return
    const style = getComputedStyle(marker.value)
    const duration =
      Number.parseFloat(style.getPropertyValue('--duration-spring-smooth')) || GLIDE_MS_FALLBACK
    const easing = style.getPropertyValue('--ease-spring-smooth').trim() || GLIDE_EASING_FALLBACK
    running = marker.value.animate(keyframes, { duration, easing })
  }
  const measure = () => {
    const item = target()
    measured.value = item
    const next = targetBox(item)
    // The item moved or resized mid-glide: glide on from where the marker is drawn instead of
    // jumping to the new place when the old glide ends.
    const isRetarget = running?.playState === 'running' && !isSameMarkerBox(box.value, next)
    const from = isRetarget ? drawnBox() : null
    box.value = next
    if (isRetarget && next) slide(from, next)
  }
  const glide = async () => {
    const from = drawnBox()
    running?.cancel()
    running = null
    await nextTick()
    measure()
    if (box.value) slide(from, box.value)
  }
  const skipNext = () => {
    isSkipping = true
  }

  watch(selected, () => {
    if (!isSkipping) return void glide()
    isSkipping = false
    running?.cancel()
    running = null
    void nextTick(measure)
  })
  // Labels change with the language and the fonts load late: the box follows the group's size and
  // the item's own.
  useResizeObserver(group, measure)
  useResizeObserver(measured, measure)

  onMounted(measure)

  return { box, measure, skipNext }
}
