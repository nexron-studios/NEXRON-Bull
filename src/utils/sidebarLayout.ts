import { KEY_STEP_LARGE_PX, KEY_STEP_PX, SNAP_PX, snapEdge } from '@/utils/edgeSnap'

/** How the sidebar sits next to the chat: a rail of icons, a resizable panel, or all of it. */
export const sidebarLayoutList = ['rail', 'panel', 'full'] as const
export type SidebarLayout = (typeof sidebarLayoutList)[number]

/** The collapsed sidebar: icons only. */
export const RAIL_WIDTH = 56
export const SIDEBAR_MIN_WIDTH = 240
export const SIDEBAR_DEFAULT_WIDTH = 320
/** Wider than this the rows only gain empty space; the whole width is the full layout's job. */
export const SIDEBAR_MAX_WIDTH = 480
/** Narrower than this the chat cannot show a message; past it the sidebar takes everything. */
export const CHAT_MIN_WIDTH = 320

export interface SidebarSize {
  layout: SidebarLayout
  /** The panel width, kept while the layout is rail or full so it comes back */
  width: number
}

/** A stored value from an older version or another tool falls back to the panel. */
export const parseSidebarLayout = (value: unknown): SidebarLayout =>
  sidebarLayoutList.find((layout) => layout === value) ?? 'panel'

/** Past this pointer position the chat would get less than its minimum: the sidebar takes all. */
const fullWidthFrom = (windowWidth: number): number => windowWidth - CHAT_MIN_WIDTH

/** The widest the panel can be: its own cap, or less when the chat needs the room. */
export const maxPanelWidth = (windowWidth: number): number =>
  Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, fullWidthFrom(windowWidth)))

/** The panel width actually shown, e.g. after the window got narrower than when it was set. */
export const panelWidthIn = (width: number, windowWidth: number): number =>
  Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), maxPanelWidth(windowWidth))

/**
 * Where a drag of the edge to `x` lands: the rail well below the minimum (`snapEdge`), the minimum
 * or the widest panel close to them, and full width once the chat would get less than its minimum
 * plus the snap distance. Between the panel's cap and that point the panel stays at its cap, so
 * full width is a deliberate pull to the far side, not a twitch past 480 px. Rail and full width
 * keep `width`, the panel width the drag started from, for the way back.
 */
export const sizeAtPointer = (x: number, windowWidth: number, width: number): SidebarSize => {
  const max = maxPanelWidth(windowWidth)
  if (x > Math.max(max, fullWidthFrom(windowWidth)) + SNAP_PX) return { layout: 'full', width }
  const snap = snapEdge(x, SIDEBAR_MIN_WIDTH, max)
  switch (snap.kind) {
    case 'collapse':
      return { layout: 'rail', width }
    case 'beyond':
      return { layout: 'panel', width: max }
    case 'width':
      return { layout: 'panel', width: snap.width }
    default: {
      const unhandled: never = snap
      throw new Error(`Unhandled edge snap: ${JSON.stringify(unhandled)}`)
    }
  }
}

/**
 * Arrow keys on the edge: a step, Home to the minimum, End to full width. Like the pointer, a step
 * past the cap stays at the cap; only where the chat itself limits the panel does it go on to full
 * width.
 */
export const sizeAfterKey = (
  key: string,
  isLarge: boolean,
  size: SidebarSize,
  windowWidth: number
): SidebarSize | null => {
  // The rail is already as small as it gets.
  if (size.layout === 'rail' && (key === 'ArrowLeft' || key === 'Home')) return null
  const step = isLarge ? KEY_STEP_LARGE_PX : KEY_STEP_PX
  const current = size.layout === 'panel' ? panelWidthIn(size.width, windowWidth) : size.width
  switch (key) {
    case 'ArrowLeft':
      if (size.layout === 'full') return { layout: 'panel', width: maxPanelWidth(windowWidth) }
      return { layout: 'panel', width: Math.max(SIDEBAR_MIN_WIDTH, current - step) }
    case 'ArrowRight':
      if (size.layout === 'rail') return { layout: 'panel', width: SIDEBAR_MIN_WIDTH }
      // Keys do not snap: one step from the widest panel goes to full width, unless that is the cap.
      if (current >= maxPanelWidth(windowWidth)) {
        if (maxPanelWidth(windowWidth) >= SIDEBAR_MAX_WIDTH) return null
        return { layout: 'full', width: size.width }
      }
      return { layout: 'panel', width: Math.min(current + step, maxPanelWidth(windowWidth)) }
    case 'Home':
      return { layout: 'panel', width: SIDEBAR_MIN_WIDTH }
    case 'End':
      return { layout: 'full', width: size.width }
    default:
      return null
  }
}
