/**
 * Which of a scroll area's sections has its sticky heading stuck to the top: the one that starts
 * furthest down while still at or above the scroll position. `tops` are the sections' offsets in
 * the scroll area, in any order; -1 while the area rests at its start, where no heading is stuck.
 */
export const stuckIndexOf = (tops: number[], scrollTop: number): number => {
  if (scrollTop <= 0) return -1
  return tops.reduce(
    (stuck, top, index) => (top <= scrollTop && (stuck < 0 || top > tops[stuck]) ? index : stuck),
    -1
  )
}
