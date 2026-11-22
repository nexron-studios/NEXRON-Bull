import { KEY_STEP_LARGE_PX, KEY_STEP_PX, snapEdge } from '@/utils/edgeSnap'

/** The panel right of the chat, as wide as it was before it could be dragged. */
export const INFO_PANEL_DEFAULT_WIDTH = 304
/** Narrower than this the account card and the connector rows wrap badly. */
export const INFO_PANEL_MIN_WIDTH = 280
/** Below this window width the panel stays hidden, whatever was saved. */
export const INFO_PANEL_MIN_WINDOW = 1100
/** The chat next to the panel keeps at least this much, or the panel gives way. */
export const CHAT_BESIDE_PANEL_MIN_WIDTH = 480

/** Where a drag or a key on the panel's edge leaves it; shut keeps the stored width. */
export type InfoPanelSize = { isOpen: false } | { isOpen: true; width: number }

/** The room left for the panel once the sidebar and the chat's minimum took theirs. */
const roomFor = (windowWidth: number, sidebarWidth: number): number =>
  windowWidth - sidebarWidth - CHAT_BESIDE_PANEL_MIN_WIDTH

/**
 * Whether the panel fits next to the chat at its narrowest. A wide sidebar takes its room too, so
 * a large window with the sidebar pulled far out still hides it.
 */
export const hasInfoPanelRoom = (windowWidth: number, sidebarWidth: number): boolean =>
  windowWidth >= INFO_PANEL_MIN_WINDOW && roomFor(windowWidth, sidebarWidth) >= INFO_PANEL_MIN_WIDTH

/** The widest the panel can be in this window, next to this sidebar: all the chat can spare. */
export const infoPanelMaxWidth = (windowWidth: number, sidebarWidth: number): number =>
  Math.max(INFO_PANEL_MIN_WIDTH, roomFor(windowWidth, sidebarWidth))

/** A stored value that is no number (edited, or from another tool) falls back to the default. */
export const parseInfoPanelWidth = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : INFO_PANEL_DEFAULT_WIDTH

/** A stored or dragged width, held between the minimum and what the window allows. */
export const clampInfoPanelWidth = (width: number, maxWidth: number): number =>
  Math.round(Math.min(Math.max(width, INFO_PANEL_MIN_WIDTH), maxWidth))

/**
 * Where a drag of the panel's left edge lands, like the sidebar's (`snapEdge`): shut more than
 * 40 px below the minimum, which a pointer at the window's right edge always is, the minimum or
 * the widest width close to them, and the widest width past it.
 */
export const infoPanelSizeAtDrag = (width: number, maxWidth: number): InfoPanelSize => {
  const snap = snapEdge(width, INFO_PANEL_MIN_WIDTH, maxWidth)
  switch (snap.kind) {
    case 'collapse':
      return { isOpen: false }
    case 'beyond':
      return { isOpen: true, width: maxWidth }
    case 'width':
      return { isOpen: true, width: snap.width }
    default: {
      const unhandled: never = snap
      throw new Error(`Unhandled edge snap: ${JSON.stringify(unhandled)}`)
    }
  }
}

/**
 * Arrow keys on the panel's left edge: left widens it, right narrows it, Home to the minimum,
 * End to the widest this window allows. Null for any other key.
 */
export const infoPanelWidthAfterKey = (
  key: string,
  isLarge: boolean,
  width: number,
  maxWidth: number
): number | null => {
  const step = isLarge ? KEY_STEP_LARGE_PX : KEY_STEP_PX
  switch (key) {
    case 'ArrowLeft':
      return clampInfoPanelWidth(width + step, maxWidth)
    case 'ArrowRight':
      return clampInfoPanelWidth(width - step, maxWidth)
    case 'Home':
      return INFO_PANEL_MIN_WIDTH
    case 'End':
      return maxWidth
    default:
      return null
  }
}
