import {
  INFO_PANEL_DEFAULT_WIDTH,
  INFO_PANEL_MIN_WIDTH,
  hasInfoPanelRoom,
  infoPanelMaxWidth
} from '@/utils/infoPanel'
import { hasPreviewRoom, previewMaxWidth, previewWidthOf } from '@/utils/previewPane'
import { clampColumnWidth } from '@/utils/sideColumn'

/** What the user asked of a column: open or not, and the width stored or dragged (`null`: none). */
export interface ColumnWish {
  isOpen: boolean
  width: number | null
}

/** What the window grants a column. */
export interface ColumnLayout {
  /** It fits beside the chat now; its toggle shows */
  canShow: boolean
  isShown: boolean
  width: number
  maxWidth: number
}

export interface ChatColumnsInput {
  windowWidth: number
  /** What the sidebar takes left of the chat; 0 where it is a drawer */
  sidebarWidth: number
  /** A chat is on screen, so the columns beside it may show */
  hasChat: boolean
  panel: ColumnWish
  preview: ColumnWish
}

export interface ChatColumns {
  panel: ColumnLayout
  preview: ColumnLayout
}

/**
 * How wide the columns right of the chat are: chat, preview, info panel. The open panel keeps its
 * minimum, so opening the preview never hides the panel or its button: the preview narrows, or
 * gives way where even that does not fit. The panel then takes what the preview leaves.
 */
export const columnWidthsOf = ({
  windowWidth,
  sidebarWidth,
  hasChat,
  panel,
  preview
}: ChatColumnsInput): ChatColumns => {
  const canShowPanel = hasChat && hasInfoPanelRoom(windowWidth, sidebarWidth)
  const isPanelShown = panel.isOpen && canShowPanel
  const leftOfPreview = sidebarWidth + (isPanelShown ? INFO_PANEL_MIN_WIDTH : 0)
  const canShowPreview = hasChat && hasPreviewRoom(windowWidth, leftOfPreview)
  const previewMax = previewMaxWidth(windowWidth, leftOfPreview)
  const previewLayout: ColumnLayout = {
    canShow: canShowPreview,
    isShown: preview.isOpen && canShowPreview,
    width: previewWidthOf(preview.width, previewMax),
    maxWidth: previewMax
  }
  const takenByPreview = previewLayout.isShown ? previewLayout.width : 0
  const panelMax = infoPanelMaxWidth(windowWidth, sidebarWidth + takenByPreview)
  const panelWidth = panel.width ?? INFO_PANEL_DEFAULT_WIDTH
  return {
    panel: {
      canShow: canShowPanel,
      isShown: isPanelShown,
      width: clampColumnWidth(panelWidth, INFO_PANEL_MIN_WIDTH, panelMax),
      maxWidth: panelMax
    },
    preview: previewLayout
  }
}
