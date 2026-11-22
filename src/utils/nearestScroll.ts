/** Edges on one axis, in viewport px, as `getBoundingClientRect` gives them. */
export interface ScrollEdges {
  itemStart: number
  itemEnd: number
  viewStart: number
  viewEnd: number
}

/**
 * The scroll position that brings an item into its list with the least movement, like
 * `scrollIntoView({ block: 'nearest' })` but for that list alone: `scrollIntoView` also scrolls
 * the clipped layout around it. An item larger than the list keeps its start in view.
 */
export const nearestScrollOf = (
  { itemStart, itemEnd, viewStart, viewEnd }: ScrollEdges,
  scroll: number
): number => {
  // Already fills the list: any move would hide part of it.
  if (itemStart <= viewStart && itemEnd >= viewEnd) return scroll
  if (itemStart < viewStart) return scroll - (viewStart - itemStart)
  if (itemEnd > viewEnd) return scroll + Math.min(itemEnd - viewEnd, itemStart - viewStart)
  return scroll
}
