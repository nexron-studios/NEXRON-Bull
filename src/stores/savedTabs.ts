import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SavedTab } from '@/utils/chatTab'

/**
 * What reopens the tabs after a restart; messages come back from the transcripts. Its own store
 * because the persistence plugin watches its store deeply on every change: on the chat store that
 * walked every message of every tab for each streamed token. Same key and shape as when the chat
 * store saved itself, so tabs saved by an older Bull open as before.
 */
export const useSavedTabsStore = defineStore(
  'savedTabs',
  () => {
    const activeId = ref<string | null>(null)
    const tabs = ref<SavedTab[]>([])

    const save = (next: { activeId: string | null; tabs: SavedTab[] }) => {
      activeId.value = next.activeId
      tabs.value = next.tabs
    }

    return { activeId, tabs, save }
  },
  { persist: { key: 'chat' } }
)
