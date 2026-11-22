/** The sizes of the element a pointer event landed on, as the DOM gives them. */
export interface HitTarget {
  clientWidth: number
  clientHeight: number
  scrollWidth: number
  scrollHeight: number
}

/**
 * Whether a pointer event with these `offsetX`/`offsetY` hit the element's scrollbar rather than
 * its content: past the client box of an element that scrolls. Inline elements report a client
 * box of 0, so only scrolling elements count.
 */
export const isScrollbarHit = (offsetX: number, offsetY: number, target: HitTarget): boolean => {
  const canScroll =
    target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth
  return canScroll && (offsetX >= target.clientWidth || offsetY >= target.clientHeight)
}
