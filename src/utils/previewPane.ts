import { KEY_STEP_LARGE_PX, KEY_STEP_PX, snapEdge } from '@/utils/edgeSnap'
import { CHAT_BESIDE_PANEL_MIN_WIDTH } from '@/utils/infoPanel'

/** Wide enough for a phone-sized page, the narrowest layout a web app is built for. */
export const PREVIEW_MIN_WIDTH = 360
export const PREVIEW_DEFAULT_WIDTH = 560
/** Until the edge is dragged the pane leaves the chat this much: at its minimum it feels cramped. */
export const CHAT_BESIDE_PREVIEW_ROOMY_WIDTH = 560

/** Where a drag or a key on the pane's edge leaves it; shut keeps the stored width. */
export type PreviewSize = { isOpen: false } | { isOpen: true; width: number }

/** The room the pane may take once the sidebar and the chat's minimum took theirs. */
const roomFor = (windowWidth: number, sidebarWidth: number): number =>
  windowWidth - sidebarWidth - CHAT_BESIDE_PANEL_MIN_WIDTH

/** Whether the pane fits beside the chat at its narrowest. */
export const hasPreviewRoom = (windowWidth: number, sidebarWidth: number): boolean =>
  roomFor(windowWidth, sidebarWidth) >= PREVIEW_MIN_WIDTH

export const previewMaxWidth = (windowWidth: number, sidebarWidth: number): number =>
  Math.max(PREVIEW_MIN_WIDTH, roomFor(windowWidth, sidebarWidth))

/** The width before any drag: the default, or less so the chat keeps its roomy width. */
const roomyWidthFor = (maxWidth: number): number =>
  Math.min(
    PREVIEW_DEFAULT_WIDTH,
    maxWidth - (CHAT_BESIDE_PREVIEW_ROOMY_WIDTH - CHAT_BESIDE_PANEL_MIN_WIDTH)
  )

/**
 * A stored or dragged width, held between the minimum and what the window allows. No number (never
 * dragged, reset, or edited by hand) means the roomy width.
 */
export const clampPreviewWidth = (value: unknown, maxWidth: number): number => {
  const width =
    typeof value === 'number' && Number.isFinite(value) ? value : roomyWidthFor(maxWidth)
  return Math.round(Math.min(Math.max(width, PREVIEW_MIN_WIDTH), maxWidth))
}

/** Where a drag of the pane's left edge lands, like the info panel's (`snapEdge`). */
export const previewSizeAtDrag = (width: number, maxWidth: number): PreviewSize => {
  const snap = snapEdge(width, PREVIEW_MIN_WIDTH, maxWidth)
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

/** Arrow keys on the pane's left edge: left widens, right narrows, Home and End to the ends. */
export const previewWidthAfterKey = (
  key: string,
  isLarge: boolean,
  width: number,
  maxWidth: number
): number | null => {
  const step = isLarge ? KEY_STEP_LARGE_PX : KEY_STEP_PX
  switch (key) {
    case 'ArrowLeft':
      return clampPreviewWidth(width + step, maxWidth)
    case 'ArrowRight':
      return clampPreviewWidth(width - step, maxWidth)
    case 'Home':
      return PREVIEW_MIN_WIDTH
    case 'End':
      return maxWidth
    default:
      return null
  }
}
