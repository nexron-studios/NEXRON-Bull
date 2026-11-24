import { nextTick, watch, type Ref, type WatchSource } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'

/** Fallbacks only: the spring lives in motion.css as `--ease-spring-smooth`. */
const MOVE_MS_FALLBACK = 280
const MOVE_EASING_FALLBACK = 'cubic-bezier(0.2, 0, 0, 1)'

/**
 * Slides the items of a row to their new place when `order` changes (FLIP, motion.md
 * "Continuity"), instead of letting them jump. Items are the children with `attribute`, matched by
 * its value. Measured from where each item is drawn, so a move during a move retargets. The Web
 * Animations API is not reached by the reduced-motion CSS block, hence the explicit check.
 * `skipNext` before an order change the user dragged: the drop already showed the move, and
 * vue-draggable-plus puts the item back at its old place for Vue to render, so it would slide twice.
 */
export const useFlipMove = (
  row: Readonly<Ref<HTMLElement | null>>,
  attribute: string,
  order: WatchSource<unknown>
) => {
  const motion = usePreferredReducedMotion()
  let isSkipping = false

  const skipNext = () => {
    isSkipping = true
  }

  // Against the row's content, so the row scrolling to a new tab is no move of every tab.
  const placeOf = (el: HTMLElement, item: HTMLElement) =>
    item.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft

  const itemsOf = (el: HTMLElement) =>
    new Map(
      [...el.querySelectorAll<HTMLElement>(`[${attribute}]`)].map((item) => [
        item.getAttribute(attribute) ?? '',
        item
      ])
    )

  watch(
    order,
    async () => {
      if (isSkipping) {
        isSkipping = false
        return
      }
      const el = row.value
      if (!el || motion.value === 'reduce') return
      const before = new Map([...itemsOf(el)].map(([key, item]) => [key, placeOf(el, item)]))
      await nextTick()
      const style = getComputedStyle(el)
      const duration =
        Number.parseFloat(style.getPropertyValue('--duration-spring-smooth')) || MOVE_MS_FALLBACK
      const easing = style.getPropertyValue('--ease-spring-smooth').trim() || MOVE_EASING_FALLBACK
      for (const [key, item] of itemsOf(el)) {
        const from = before.get(key)
        if (from === undefined) continue
        item.getAnimations().forEach((running) => running.cancel())
        const distance = from - placeOf(el, item)
        if (!distance) continue
        item.animate([{ transform: `translateX(${distance}px)` }, { transform: 'none' }], {
          duration,
          easing
        })
      }
    },
    { flush: 'pre' }
  )

  return { skipNext }
}
