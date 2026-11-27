import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { useLayoutGlide } from '@/composables/useLayoutGlide'
import { useChatStore } from '@/stores/chat'
import type { ChatTabState } from '@/utils/chatTab'
import { latestPreviewOf, parseSavedPreviews, type SavedPreview } from '@/utils/previewUrl'
import { parseStoredWidth } from '@/utils/sideColumn'

const URLS_STORAGE_KEY = 'bull.preview.urls'
const OPEN_STORAGE_KEY = 'bull.preview.open'
const WIDTH_STORAGE_KEY = 'bull.preview.width'
/** The header button that shows the pane; the focus returns there once the pane shuts. */
export const PREVIEW_TOGGLE_ID = 'preview-toggle'

/**
 * The preview beside the chat, as the user wants it: the column open or not and its width survive a
 * restart like the info panel's, the URL per tab sits next to the tab metadata. Where no column
 * fits (a phone, a small window) the preview is a sheet, asked for each time (`isSheetRequested`).
 * Whether a column fits is the caller's to say (`hasRoom`): it depends on the window's layout.
 */
export const usePreviewStore = defineStore('preview', () => {
  const saved = useStorage<Record<string, SavedPreview>>(URLS_STORAGE_KEY, {}, undefined, {
    serializer: { read: parseSavedPreviews, write: JSON.stringify }
  })
  const isOpen = useStorage(OPEN_STORAGE_KEY, false)
  /** `null` until the edge is dragged: the pane then leaves the chat its roomy width */
  const storedWidth = useStorage<number | null>(WIDTH_STORAGE_KEY, null, undefined, {
    serializer: { read: parseStoredWidth, write: String }
  })
  const isSheetRequested = ref(false)
  const { glide } = useLayoutGlide()

  /** Remembers `url` for the tab; tabs that were closed meanwhile drop out. */
  const setUrl = (tab: ChatTabState, url: string) => {
    const openIds = new Set(useChatStore().tabs.map(({ id }) => id))
    const kept = Object.entries(saved.value).filter(([id]) => openIds.has(id))
    saved.value = {
      ...Object.fromEntries(kept),
      [tab.id]: {
        url,
        detectedIn: latestPreviewOf(tab.messages)?.messageId ?? null,
        savedAt: Date.now()
      }
    }
  }

  // Asked for where no column fits; the column stays wanted too, so it is there once the window
  // has room again.
  const requestSheet = () => {
    isSheetRequested.value = true
    isOpen.value = true
  }
  const closeSheet = () => {
    isSheetRequested.value = false
    isOpen.value = false
  }

  // The chat narrows while the pane glides in.
  const toggle = (hasRoom: boolean): Promise<void> => {
    if (!hasRoom) {
      if (isSheetRequested.value) closeSheet()
      else requestSheet()
      return Promise.resolve()
    }
    return glide(() => {
      isOpen.value = !isOpen.value
      isSheetRequested.value = false
    }, true)
  }

  /** Shows `url` for the tab, opening the pane (or the sheet) if it is shut. */
  const show = (tab: ChatTabState, url: string, hasRoom: boolean) => {
    setUrl(tab, url)
    if (!hasRoom) return requestSheet()
    if (!isOpen.value) void toggle(true)
  }

  return {
    saved,
    isOpen,
    storedWidth,
    isSheetRequested,
    glide,
    setUrl,
    toggle,
    show,
    requestSheet,
    closeSheet
  }
})
