import { computed } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'

const DRAG_MS = 150
/** A click with a shaking hand stays a click; dragging starts after a few pixels. */
const DRAG_TOLERANCE_PX = 4

/**
 * The one look and feel of every vue-draggable-plus list. The fallback copy is a DOM element, so
 * it can carry the lifted shadow and brand outline (`.drag-lifted` in transitions.css); the gap
 * where it lands shows a brand line, across a list (`y`) or between items in a row (`x`).
 * Elements marked `data-no-drag` (close and remove buttons) keep their clicks.
 */
export const useDragOptions = (axis: 'x' | 'y') => {
  const motion = usePreferredReducedMotion()

  // SortableJS animates from JavaScript, out of reach of the reduced-motion block in main.css.
  return computed(() => ({
    animation: motion.value === 'reduce' ? 0 : DRAG_MS,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: DRAG_TOLERANCE_PX,
    fallbackClass: 'drag-lifted',
    ghostClass: axis === 'x' ? 'drag-ghost-x' : 'drag-ghost',
    filter: '[data-no-drag]',
    preventOnFilter: false
  }))
}
