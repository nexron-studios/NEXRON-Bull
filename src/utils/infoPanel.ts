/** The panel right of the chat, as wide as it was before it could be dragged. */
export const INFO_PANEL_DEFAULT_WIDTH = 304
/** Narrower than this the account card and the connector rows wrap badly. */
export const INFO_PANEL_MIN_WIDTH = 280
/** Below this window width the panel stays hidden, whatever was saved. */
export const INFO_PANEL_MIN_WINDOW = 1100
/** The chat next to the panel keeps at least this much, or the panel gives way. */
export const CHAT_BESIDE_PANEL_MIN_WIDTH = 480

/** The header button that shows the panel; the focus returns there once its edge shut it. */
export const INFO_PANEL_TOGGLE_ID = 'info-panel-toggle'

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
