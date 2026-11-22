import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useChatStore } from '@/stores/chat'
import { compactCommandOf } from '@/utils/contextUsage'

/**
 * The context breakdown of a tab (Figma "35"): opened by the ring in the composer, the hint above
 * it and the `/context` command, all through `openContext`. The numbers come from Claude Code's
 * `get_context_usage`, see `useContextReport`.
 */
export const useContextUsageStore = defineStore('contextUsage', () => {
  /** The tab whose breakdown is open; one at a time. */
  const openTabId = ref<string | null>(null)

  const openContext = (tabId: string) => {
    if (useChatStore().tabs.some((tab) => tab.id === tabId)) openTabId.value = tabId
  }

  const closeContext = () => {
    openTabId.value = null
  }

  /** `/compact`, with what the summary should keep when `focus` says so. */
  const compact = (tabId: string, focus = '') => {
    const chat = useChatStore()
    const status = chat.tabs.find((tab) => tab.id === tabId)?.status
    // Mid-turn Claude would read it as a prompt, not as the command.
    if (status === 'working' || status === 'asking') return
    chat.sendCommand(tabId, compactCommandOf(focus))
    closeContext()
  }

  return { openTabId, openContext, closeContext, compact }
})
