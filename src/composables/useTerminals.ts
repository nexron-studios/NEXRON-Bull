import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { isDesktopApp } from '@/lib/platform'
import { useTerminalSessions } from '@/composables/useTerminalSessions'
import { handleError } from '@/lib/error'
import { prepareTerminals } from '@/lib/terminalSession'
import { useChatStore } from '@/stores/chat'
import { useTerminalRequestStore, type TerminalRequest } from '@/stores/terminalRequests'
import { useTerminalStore } from '@/stores/terminals'

/**
 * Wires the terminals into the app, once, from the chat view: opens a tab for every request from
 * elsewhere (settings: log in to an account), ends the shells of closed terminals and of closed
 * chats' drawers, and follows the font size from the settings.
 */
export const useTerminals = () => {
  const store = useTerminalStore()
  const requests = useTerminalRequestStore()
  const chat = useChatStore()
  const { pending } = storeToRefs(requests)
  const { terminals } = storeToRefs(store)
  const { activeId, activeTab } = storeToRefs(chat)
  const { disposeExcept, setFontSize, fontSize } = useTerminalSessions()
  // Drawer shells are not saved: what a previous page load left running ends now, not when the
  // next terminal happens to start. A browser has no shells to end.
  if (isDesktopApp()) void prepareTerminals().catch(handleError)

  /** Where "Terminal here" opens: the shown chat's folder on its machine, else home here. */
  const here = computed<TerminalRequest>(() =>
    activeTab.value
      ? { machine: activeTab.value.machine, cwd: activeTab.value.cwd }
      : { machine: null, cwd: '' }
  )

  const openHere = () => store.openTab(here.value)

  /** Ctrl+`: the drawer under the shown chat. */
  const toggleDrawer = () => {
    const tab = activeTab.value
    if (!tab) return
    store.toggleDrawer(tab.id, { machine: tab.machine, cwd: tab.cwd })
  }

  watch(
    pending,
    (next) => {
      if (!next.length) return
      for (const request of requests.takeAll()) store.openTab(request)
    },
    { immediate: true }
  )
  // Any chat picked (sidebar, notification, a new session) is shown in the terminal's place.
  watch(activeId, () => {
    store.activeTabId = null
  })
  watch(
    () => terminals.value.map((entry) => entry.id),
    (ids) => disposeExcept(ids)
  )
  watch(
    () => chat.tabs.map((tab) => tab.id),
    (ids) => store.closeDrawersExcept(ids)
  )
  watch(fontSize, (size) => setFontSize(size))

  return { here, openHere, toggleDrawer }
}
