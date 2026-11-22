import { computed, ref } from 'vue'
import { useStorage, useWindowSize } from '@vueuse/core'
import { useLayoutSnap } from '@/composables/useLayoutSnap'
import {
  SIDEBAR_DEFAULT_WIDTH,
  panelWidthIn,
  parseSidebarLayout,
  type SidebarLayout,
  type SidebarSize
} from '@/utils/sidebarLayout'

const LAYOUT_STORAGE_KEY = 'bull.sidebar.layout'
const WIDTH_STORAGE_KEY = 'bull.sidebar.width'
/** On `<html>` while the sidebar snaps: only then do sidebar and chat carry a transition name. */
const SNAP_ATTRIBUTE = 'data-sidebar-snap'

/**
 * Rail, panel or full width, and the panel's width; both survive a restart. A change between the
 * three snaps with an animation; a width change inside the panel follows the pointer 1:1.
 */
export const useSidebarLayout = () => {
  const storedLayout = useStorage<string>(LAYOUT_STORAGE_KEY, 'panel')
  const storedWidth = useStorage(WIDTH_STORAGE_KEY, SIDEBAR_DEFAULT_WIDTH)
  const { width: windowWidth } = useWindowSize()
  const { snap } = useLayoutSnap(SNAP_ATTRIBUTE)

  // While the edge is dragged the size lives here; localStorage is written once, on release.
  const draft = ref<SidebarSize | null>(null)

  const committed = computed<SidebarSize>(() => ({
    layout: parseSidebarLayout(storedLayout.value),
    width: storedWidth.value
  }))
  /** The size shown right now: the drag's while it runs, else the stored one */
  const size = computed<SidebarSize>(() => draft.value ?? committed.value)
  const layout = computed<SidebarLayout>(() => size.value.layout)
  /** The layout once a drag is released; a preview is not a choice yet */
  const savedLayout = computed<SidebarLayout>(() => committed.value.layout)
  /** The panel width shown in this window */
  const panelWidth = computed(() => panelWidthIn(size.value.width, windowWidth.value))

  const change = (next: SidebarLayout, update: () => void) => snap(update, next !== layout.value)

  const preview = (next: SidebarSize) =>
    change(next.layout, () => {
      draft.value = next
    })
  const resize = (next: SidebarSize) =>
    change(next.layout, () => {
      draft.value = null
      storedLayout.value = next.layout
      storedWidth.value = next.width
    })
  const railToggled = () => (committed.value.layout === 'rail' ? 'panel' : 'rail')
  // Read again when the snap applies, so two presses in one frame cancel out.
  const toggleRail = () =>
    change(railToggled(), () => {
      storedLayout.value = railToggled()
    })
  /** Back to the panel, e.g. when a session is opened from the full-width overview. */
  const showPanel = () =>
    change('panel', () => {
      storedLayout.value = 'panel'
    })

  return {
    layout,
    savedLayout,
    size,
    panelWidth,
    windowWidth,
    preview,
    resize,
    toggleRail,
    showPanel
  }
}
