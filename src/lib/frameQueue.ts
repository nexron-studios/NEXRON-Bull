import { handleError } from '@/lib/error'

// A window in the background gets no frames; the timer hands the items over there instead.
const HIDDEN_FALLBACK_MS = 100

/**
 * Collects items and applies them together once per frame, right before it is painted, so their
 * effects render once. `drain` applies what waits at once, for something that has to come after
 * it. One item that fails is reported and does not keep the others from being applied.
 */
export const createFrameQueue = <T>(apply: (item: T) => void) => {
  let items: T[] = []
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const drain = () => {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
    frame = 0
    timer = undefined
    const taken = items
    items = []
    for (const item of taken) {
      try {
        apply(item)
      } catch (error) {
        handleError(error)
      }
    }
  }
  const push = (item: T) => {
    items.push(item)
    if (timer !== undefined) return
    frame = requestAnimationFrame(drain)
    timer = setTimeout(drain, HIDDEN_FALLBACK_MS)
  }
  return { push, drain }
}
