// A window in the background gets no frames; the timer hands the items over there instead.
const HIDDEN_FALLBACK_MS = 100

/**
 * Collects items and hands them over together once per frame, right before it is painted. `drain`
 * hands over what waits at once, for something that has to come after it.
 */
export const createFrameQueue = <T>(flush: (items: T[]) => void) => {
  let items: T[] = []
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const drain = () => {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
    frame = 0
    timer = undefined
    if (!items.length) return
    const taken = items
    items = []
    flush(taken)
  }
  const push = (item: T) => {
    items.push(item)
    if (timer !== undefined) return
    frame = requestAnimationFrame(drain)
    timer = setTimeout(drain, HIDDEN_FALLBACK_MS)
  }
  return { push, drain }
}
