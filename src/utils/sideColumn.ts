import { KEY_STEP_LARGE_PX, KEY_STEP_PX, snapEdge } from '@/utils/edgeSnap'

/**
 * A column right of the chat (info panel, preview): where a drag or a key on its left edge leaves
 * it. Shut keeps the stored width.
 */
export type ColumnSize = { isOpen: false } | { isOpen: true; width: number }

/** A width read back from localStorage: anything but a finite number counts as never set. */
export const parseStoredWidth = (raw: string): number | null => {
  const width = Number.parseFloat(raw)
  return Number.isFinite(width) ? width : null
}

/** A stored or dragged width, held between the column's minimum and what the window allows. */
export const clampColumnWidth = (width: number, min: number, max: number): number =>
  Math.round(Math.min(Math.max(width, min), max))

/**
 * Where a drag of the left edge lands (`snapEdge`): shut more than 40 px below the minimum, which a
 * pointer at the window's right edge always is, the minimum or the widest width close to them,
 * and the widest width past it.
 */
export const columnSizeAtDrag = (width: number, min: number, max: number): ColumnSize => {
  const snap = snapEdge(width, min, max)
  switch (snap.kind) {
    case 'collapse':
      return { isOpen: false }
    case 'beyond':
      return { isOpen: true, width: max }
    case 'width':
      return { isOpen: true, width: snap.width }
    default: {
      const unhandled: never = snap
      throw new Error(`Unhandled edge snap: ${JSON.stringify(unhandled)}`)
    }
  }
}

/**
 * Arrow keys on the left edge: left widens the column, right narrows it, Home to the minimum, End
 * to the widest this window allows. Null for any other key.
 */
export const columnWidthAfterKey = (
  key: string,
  isLarge: boolean,
  width: number,
  min: number,
  max: number
): number | null => {
  const step = isLarge ? KEY_STEP_LARGE_PX : KEY_STEP_PX
  switch (key) {
    case 'ArrowLeft':
      return clampColumnWidth(width + step, min, max)
    case 'ArrowRight':
      return clampColumnWidth(width - step, min, max)
    case 'Home':
      return min
    case 'End':
      return max
    default:
      return null
  }
}
