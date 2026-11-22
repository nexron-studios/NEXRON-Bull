/** Within this distance of the minimum or of the widest width a drag snaps onto it. */
export const SNAP_PX = 24
/** Dragged more than this below its minimum, a column folds away (into the rail, or shut). */
export const COLLAPSE_SNAP_PX = 40
export const KEY_STEP_PX = 16
export const KEY_STEP_LARGE_PX = 64

/**
 * Where a dragged column edge lands: folded away well below the minimum, past the widest width,
 * or at a width, snapped onto the minimum or the widest one close to them.
 */
export type EdgeSnap = { kind: 'collapse' } | { kind: 'beyond' } | { kind: 'width'; width: number }

/** `width` is what the pointer asks for, unrounded and unbounded. */
export const snapEdge = (width: number, min: number, max: number): EdgeSnap => {
  if (width < min - COLLAPSE_SNAP_PX) return { kind: 'collapse' }
  if (width > max + SNAP_PX) return { kind: 'beyond' }
  // In a tight window the two snap zones would overlap: each ends halfway between min and max.
  const middle = (min + max) / 2
  if (width < Math.min(min + SNAP_PX, middle)) return { kind: 'width', width: min }
  if (width >= Math.max(max - SNAP_PX, middle)) return { kind: 'width', width: max }
  return { kind: 'width', width: Math.round(width) }
}
