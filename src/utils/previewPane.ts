import { CHAT_BESIDE_PANEL_MIN_WIDTH } from '@/utils/infoPanel'
import { clampColumnWidth } from '@/utils/sideColumn'

/** Wide enough for a phone-sized page, the narrowest layout a web app is built for. */
export const PREVIEW_MIN_WIDTH = 360
export const PREVIEW_DEFAULT_WIDTH = 560
/** Until the edge is dragged the pane leaves the chat this much: at its minimum it feels cramped. */
export const CHAT_BESIDE_PREVIEW_ROOMY_WIDTH = 560

/** How the preview is on screen: a column beside the chat, a sheet where none fits, or not. */
export const previewShownAsList = ['pane', 'sheet', 'none'] as const
export type PreviewShownAs = (typeof previewShownAsList)[number]

/** The room the pane may take once the sidebar and the chat's minimum took theirs. */
const roomFor = (windowWidth: number, sidebarWidth: number): number =>
  windowWidth - sidebarWidth - CHAT_BESIDE_PANEL_MIN_WIDTH

/** Whether the pane fits beside the chat at its narrowest. */
export const hasPreviewRoom = (windowWidth: number, sidebarWidth: number): boolean =>
  roomFor(windowWidth, sidebarWidth) >= PREVIEW_MIN_WIDTH

export const previewMaxWidth = (windowWidth: number, sidebarWidth: number): number =>
  Math.max(PREVIEW_MIN_WIDTH, roomFor(windowWidth, sidebarWidth))

/**
 * The pane's width: a stored or dragged one held inside the window, or before any drag (`null`)
 * the default, narrowed so the chat keeps its roomy width.
 */
export const previewWidthOf = (width: number | null, maxWidth: number): number => {
  const roomy = Math.min(
    PREVIEW_DEFAULT_WIDTH,
    maxWidth - (CHAT_BESIDE_PREVIEW_ROOMY_WIDTH - CHAT_BESIDE_PANEL_MIN_WIDTH)
  )
  return clampColumnWidth(width ?? roomy, PREVIEW_MIN_WIDTH, maxWidth)
}

/**
 * Where the preview shows: the column wherever one fits and it is open, otherwise the sheet the
 * user asked for.
 */
export const previewShownAs = (
  hasRoom: boolean,
  isOpen: boolean,
  isSheetRequested: boolean
): PreviewShownAs => {
  if (hasRoom) return isOpen ? 'pane' : 'none'
  return isSheetRequested ? 'sheet' : 'none'
}
