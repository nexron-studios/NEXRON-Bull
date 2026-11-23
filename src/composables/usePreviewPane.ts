import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { onKeyStroke } from '@vueuse/core'
import { usePreviewStore } from '@/stores/preview'
import {
  PREVIEW_DEFAULT_WIDTH,
  PREVIEW_MIN_WIDTH,
  clampPreviewWidth,
  hasPreviewRoom,
  previewMaxWidth,
  type PreviewSize
} from '@/utils/previewPane'
import { isPreviewShortcut } from '@/utils/shortcuts'

/**
 * The preview's column beside the chat, sized like the info panel: it gives way when the window
 * leaves the chat too little, and then opens as a sheet. Ctrl+Shift+P toggles it while a chat is
 * on screen (`hasChat`).
 */
export const usePreviewPane = (
  windowWidth: MaybeRefOrGetter<number>,
  sidebarWidth: MaybeRefOrGetter<number>,
  hasChat: MaybeRefOrGetter<boolean>
) => {
  const preview = usePreviewStore()
  // While the edge is dragged the size lives here; localStorage is written once, on release.
  const draft = ref<PreviewSize | null>(null)

  const canShow = computed(
    () => toValue(hasChat) && hasPreviewRoom(toValue(windowWidth), toValue(sidebarWidth))
  )
  const isShown = computed(() => preview.isOpen && canShow.value)
  /** A drag that would shut the pane on release; it stays on screen until then, to come back */
  const isClosing = computed(() => draft.value?.isOpen === false)
  const maxWidth = computed(() => previewMaxWidth(toValue(windowWidth), toValue(sidebarWidth)))
  const width = computed(() => {
    if (isClosing.value) return PREVIEW_MIN_WIDTH
    const next = draft.value?.isOpen ? draft.value.width : preview.storedWidth
    return clampPreviewWidth(next, maxWidth.value)
  })
  /** What the pane takes from the row, for the info panel to fit itself beside it */
  const takenWidth = computed(() => (isShown.value ? width.value : 0))

  const resize = (next: PreviewSize) =>
    preview.snap(() => {
      draft.value = null
      if (next.isOpen) preview.storedWidth = next.width
      else preview.isOpen = false
    }, !next.isOpen && isShown.value)
  const resetWidth = () => resize({ isOpen: true, width: PREVIEW_DEFAULT_WIDTH })

  watch(
    canShow,
    (fits) => {
      preview.hasRoom = fits
      // The pane came back beside the chat: the sheet that stood in for it goes.
      if (fits) preview.isSheetOpen = false
    },
    { immediate: true }
  )

  onKeyStroke(isPreviewShortcut, (event) => {
    if (!toValue(hasChat)) return
    event.preventDefault()
    preview.toggle()
  })

  return {
    canShow,
    isShown,
    isClosing,
    width,
    maxWidth,
    takenWidth,
    preview: (next: PreviewSize) => {
      draft.value = next
    },
    resize,
    resetWidth
  }
}
