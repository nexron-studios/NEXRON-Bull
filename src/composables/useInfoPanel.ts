import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { onKeyStroke, useStorage } from '@vueuse/core'
import { useLayoutSnap } from '@/composables/useLayoutSnap'
import {
  INFO_PANEL_DEFAULT_WIDTH,
  INFO_PANEL_MIN_WIDTH,
  clampInfoPanelWidth,
  hasInfoPanelRoom,
  infoPanelMaxWidth,
  parseInfoPanelWidth,
  type InfoPanelSize
} from '@/utils/infoPanel'
import { isInfoPanelShortcut } from '@/utils/shortcuts'

const OPEN_STORAGE_KEY = 'bull.panel.open'
const WIDTH_STORAGE_KEY = 'bull.panel.width'
/** On `<html>` while the panel slides in or out: only then do chat and panel carry a name. */
const SNAP_ATTRIBUTE = 'data-panel-snap'
/** The header button that shows the panel; the focus returns there once its edge shut it. */
export const INFO_PANEL_TOGGLE_ID = 'info-panel-toggle'

/**
 * The panel right of the chat: open or closed and its width survive a restart, and it gives way
 * on its own in a narrow window or next to a wide sidebar. Ctrl+. toggles it, but only where it
 * could show: `hasChat` is false while no chat is on screen, and then the key leaves the saved
 * choice alone.
 */
export const useInfoPanel = (
  windowWidth: MaybeRefOrGetter<number>,
  sidebarWidth: MaybeRefOrGetter<number>,
  hasChat: MaybeRefOrGetter<boolean>
) => {
  const isOpen = useStorage(OPEN_STORAGE_KEY, true)
  const storedWidth = useStorage(WIDTH_STORAGE_KEY, INFO_PANEL_DEFAULT_WIDTH)
  // While the edge is dragged the size lives here; localStorage is written once, on release.
  const draft = ref<InfoPanelSize | null>(null)
  const { snap } = useLayoutSnap(SNAP_ATTRIBUTE)

  const canShow = computed(
    () => toValue(hasChat) && hasInfoPanelRoom(toValue(windowWidth), toValue(sidebarWidth))
  )
  const isShown = computed(() => isOpen.value && canShow.value)
  /** A drag that would shut the panel on release; it stays on screen until then, to come back */
  const isClosing = computed(() => draft.value?.isOpen === false)
  const maxWidth = computed(() => infoPanelMaxWidth(toValue(windowWidth), toValue(sidebarWidth)))
  /** The width shown right now, e.g. narrower than stored after the sidebar was widened */
  const width = computed(() => {
    if (isClosing.value) return INFO_PANEL_MIN_WIDTH
    const next = draft.value?.isOpen ? draft.value.width : parseInfoPanelWidth(storedWidth.value)
    return clampInfoPanelWidth(next, maxWidth.value)
  })

  // The chat narrows while the panel slides in from the window's edge, and back when it shuts.
  // Flipped when the snap applies, so two toggles in one frame cancel out.
  const toggle = () =>
    snap(() => {
      isOpen.value = !isOpen.value
    }, canShow.value)
  const preview = (next: InfoPanelSize) => {
    draft.value = next
  }
  // Never opens the panel: a drag that ends because Ctrl+. shut it mid-drag keeps it shut. Shutting
  // keeps the stored width, which may be wider than this window shows, for the toolbar button.
  const resize = (next: InfoPanelSize) =>
    snap(() => {
      draft.value = null
      if (next.isOpen) storedWidth.value = next.width
      else isOpen.value = false
    }, !next.isOpen && isShown.value)
  const resetWidth = () => resize({ isOpen: true, width: INFO_PANEL_DEFAULT_WIDTH })

  onKeyStroke(isInfoPanelShortcut, (event) => {
    if (!canShow.value) return
    event.preventDefault()
    toggle()
  })

  return {
    isOpen,
    canShow,
    isShown,
    isClosing,
    width,
    maxWidth,
    toggle,
    preview,
    resize,
    resetWidth
  }
}
