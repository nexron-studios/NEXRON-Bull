import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { useLayoutSnap } from '@/composables/useLayoutSnap'
import { useChatStore } from '@/stores/chat'
import type { ChatTabState } from '@/utils/chatTab'
import { PREVIEW_DEFAULT_WIDTH } from '@/utils/previewPane'
import { latestPreviewOf, type SavedPreview } from '@/utils/previewUrl'

const URLS_STORAGE_KEY = 'bull.preview.urls'
const OPEN_STORAGE_KEY = 'bull.preview.open'
const WIDTH_STORAGE_KEY = 'bull.preview.width'
/** On `<html>` while the pane slides in or out (transitions.css). */
export const PREVIEW_SNAP_ATTRIBUTE = 'data-preview-snap'
/** The header button that shows the pane; the focus returns there once the pane shuts. */
export const PREVIEW_TOGGLE_ID = 'preview-toggle'

/**
 * The preview beside the chat: whether it is open and how wide survive a restart, like the info
 * panel; the URL a tab shows was typed or picked by the user, next to the tab metadata in
 * localStorage. Where the pane has no room beside the chat (a phone, a small window), it opens
 * as a sheet instead (`isSheetOpen`).
 */
export const usePreviewStore = defineStore('preview', () => {
  const saved = useStorage<Record<string, SavedPreview>>(URLS_STORAGE_KEY, {})
  const isOpen = useStorage(OPEN_STORAGE_KEY, false)
  const storedWidth = useStorage(WIDTH_STORAGE_KEY, PREVIEW_DEFAULT_WIDTH)
  const isSheetOpen = ref(false)
  /** Whether the pane fits beside the chat right now; kept up to date by `usePreviewPane` */
  const hasRoom = ref(false)
  const { snap } = useLayoutSnap(PREVIEW_SNAP_ATTRIBUTE)

  /** Remembers `url` for the tab; tabs that were closed meanwhile drop out. */
  const setUrl = (tab: ChatTabState, url: string) => {
    const openIds = new Set(useChatStore().tabs.map(({ id }) => id))
    const kept = Object.entries(saved.value).filter(([id]) => openIds.has(id))
    saved.value = {
      ...Object.fromEntries(kept),
      [tab.id]: { url, detectedIn: latestPreviewOf(tab.messages)?.messageId ?? null }
    }
  }

  // The chat narrows while the pane slides in; flipped when the snap applies, so two toggles in
  // one frame cancel out.
  const toggle = (): Promise<void> => {
    if (!hasRoom.value) {
      isSheetOpen.value = !isSheetOpen.value
      return Promise.resolve()
    }
    return snap(() => {
      isOpen.value = !isOpen.value
    }, true)
  }

  /** Shows `url` for the tab, opening the pane (or the sheet) if it is shut. */
  const show = (tab: ChatTabState, url: string) => {
    setUrl(tab, url)
    if (!hasRoom.value) isSheetOpen.value = true
    else if (!isOpen.value) void toggle()
  }

  return { saved, isOpen, storedWidth, isSheetOpen, hasRoom, snap, setUrl, toggle, show }
})
