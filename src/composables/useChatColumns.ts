import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { storeToRefs } from 'pinia'
import { onKeyStroke, useStorage } from '@vueuse/core'
import { useLayoutSnap } from '@/composables/useLayoutSnap'
import { useSideColumn } from '@/composables/useSideColumn'
import { usePreviewStore } from '@/stores/preview'
import type { ChatTabState } from '@/utils/chatTab'
import { columnWidthsOf } from '@/utils/chatColumns'
import { INFO_PANEL_DEFAULT_WIDTH, INFO_PANEL_MIN_WIDTH } from '@/utils/infoPanel'
import { PREVIEW_MIN_WIDTH, previewShownAs } from '@/utils/previewPane'
import { isInfoPanelShortcut, isPreviewShortcut } from '@/utils/shortcuts'
import { parseStoredWidth, type ColumnSize } from '@/utils/sideColumn'

const PANEL_OPEN_STORAGE_KEY = 'bull.panel.open'
const PANEL_WIDTH_STORAGE_KEY = 'bull.panel.width'
/** On `<html>` while the panel slides in or out: only then do chat and panel carry a name. */
const PANEL_SNAP_ATTRIBUTE = 'data-panel-snap'

/**
 * The two columns right of the chat, the preview and the info panel, and how the window shares out
 * between them (`columnWidthsOf`). Open or shut and the widths survive a restart. Ctrl+. and
 * Ctrl+Shift+P toggle them while a chat is on screen (`hasChat`); otherwise the keys leave the
 * saved choice alone.
 */
export const useChatColumns = (
  windowWidth: MaybeRefOrGetter<number>,
  sidebarWidth: MaybeRefOrGetter<number>,
  hasChat: MaybeRefOrGetter<boolean>
) => {
  const previewStore = usePreviewStore()
  const { isOpen: isPreviewOpen, storedWidth: previewWidth } = storeToRefs(previewStore)
  const isPanelOpen = useStorage(PANEL_OPEN_STORAGE_KEY, true)
  const panelWidth = useStorage<number | null>(
    PANEL_WIDTH_STORAGE_KEY,
    INFO_PANEL_DEFAULT_WIDTH,
    undefined,
    { serializer: { read: parseStoredWidth, write: String } }
  )
  const { snap: snapPanel } = useLayoutSnap(PANEL_SNAP_ATTRIBUTE)
  const panelEdge = useSideColumn({
    isOpen: isPanelOpen,
    storedWidth: panelWidth,
    minWidth: INFO_PANEL_MIN_WIDTH,
    snap: snapPanel
  })
  const previewEdge = useSideColumn({
    isOpen: isPreviewOpen,
    storedWidth: previewWidth,
    minWidth: PREVIEW_MIN_WIDTH,
    snap: previewStore.snap
  })

  const layout = computed(() =>
    columnWidthsOf({
      windowWidth: toValue(windowWidth),
      sidebarWidth: toValue(sidebarWidth),
      hasChat: toValue(hasChat),
      panel: panelEdge.wish.value,
      preview: previewEdge.wish.value
    })
  )
  const shownAs = computed(() =>
    previewShownAs(layout.value.preview.canShow, isPreviewOpen.value, previewStore.isSheetRequested)
  )

  // The chat narrows while the panel slides in from the window's edge, and back when it shuts.
  // Flipped when the snap applies, so two toggles in one frame cancel out.
  const togglePanel = () =>
    snapPanel(() => {
      isPanelOpen.value = !isPanelOpen.value
    }, layout.value.panel.canShow)
  const togglePreview = () => previewStore.toggle(layout.value.preview.canShow)

  const panel = {
    layout: computed(() => layout.value.panel),
    isOpen: isPanelOpen,
    isClosing: panelEdge.isClosing,
    minWidth: INFO_PANEL_MIN_WIDTH,
    toggle: togglePanel,
    preview: panelEdge.preview,
    resize: (next: ColumnSize) => panelEdge.resize(next, layout.value.panel.isShown),
    resetWidth: panelEdge.resetWidth
  }
  const preview = {
    layout: computed(() => layout.value.preview),
    shownAs,
    isClosing: previewEdge.isClosing,
    minWidth: PREVIEW_MIN_WIDTH,
    toggle: togglePreview,
    preview: previewEdge.preview,
    resize: (next: ColumnSize) => previewEdge.resize(next, layout.value.preview.isShown),
    resetWidth: previewEdge.resetWidth,
    show: (tab: ChatTabState, url: string) =>
      previewStore.show(tab, url, layout.value.preview.canShow)
  }

  onKeyStroke(isInfoPanelShortcut, (event) => {
    if (!layout.value.panel.canShow) return
    event.preventDefault()
    void togglePanel()
  })
  onKeyStroke(isPreviewShortcut, (event) => {
    if (!toValue(hasChat)) return
    event.preventDefault()
    void togglePreview()
  })

  return { panel, preview }
}

/** One column right of the chat, as `ChatSideColumn` drives it. */
export type SideColumn = ReturnType<typeof useChatColumns>['panel' | 'preview']
