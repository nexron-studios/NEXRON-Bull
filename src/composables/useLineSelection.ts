import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useEventListener } from '@vueuse/core'
import { rangeOf, type LineRange } from '@/utils/diffReview'

/** Keys that move the cursor, by how far: one line, or to the first or last. */
const STEPS: Record<string, number> = {
  ArrowDown: 1,
  ArrowUp: -1,
  End: Infinity,
  Home: -Infinity
}

/**
 * Choosing lines of a diff, one or a range, like rows in a file manager: a press starts at a line,
 * Shift or a drag extends from there, arrow keys move the cursor and Shift+arrows extend.
 * `indices` are the lines that can be chosen, top to bottom.
 */
export const useLineSelection = (indices: MaybeRefOrGetter<number[]>) => {
  const anchor = ref<number | null>(null)
  const cursor = ref<number | null>(null)
  const isDragging = ref(false)

  const range = computed<LineRange | null>(() =>
    anchor.value === null || cursor.value === null ? null : rangeOf(anchor.value, cursor.value)
  )

  const select = (index: number, isExtending: boolean) => {
    cursor.value = index
    if (!isExtending || anchor.value === null) anchor.value = index
  }

  const press = (index: number, event: PointerEvent) => {
    if (event.button !== 0) return
    // Without this, a drag over the numbers starts a text selection in the lines beside them.
    event.preventDefault()
    select(index, event.shiftKey)
    isDragging.value = true
  }

  const sweep = (index: number) => {
    if (isDragging.value) select(index, true)
  }

  /** `step`: +1/-1 for the arrows, ±Infinity for End/Home. */
  const move = (step: number, isExtending: boolean) => {
    const list = toValue(indices)
    const at = cursor.value === null ? -1 : list.indexOf(cursor.value)
    const start = at === -1 ? (step > 0 ? -1 : list.length) : at
    const target = list[Math.max(0, Math.min(list.length - 1, start + step))]
    if (target === undefined) return
    select(target, isExtending)
  }

  /** Arrow keys, Home and End, with Shift to extend; `true` when the key was one of them. */
  const handleKey = (event: KeyboardEvent): boolean => {
    const step = STEPS[event.key]
    if (step === undefined) return false
    event.preventDefault()
    move(step, event.shiftKey)
    return true
  }

  const isChosen = (index: number) =>
    range.value !== null && index >= range.value.start && index <= range.value.end

  // A drag also ends when the pointer is taken away or the window loses focus mid-drag.
  useEventListener(window, ['pointerup', 'pointercancel', 'blur'], () => (isDragging.value = false))

  const clear = () => {
    anchor.value = null
    cursor.value = null
  }

  return { range, cursor, press, sweep, move, handleKey, isChosen, clear }
}
