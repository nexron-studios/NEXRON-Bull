import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import type { Machine } from '@/api/services/agentd.service'
import { useIsPhone } from '@/composables/useViewport'
import { useChatStore } from '@/stores/chat'
import { useTerminalStore } from '@/stores/terminals'
import type { SessionSummaryProps } from '@/types/agentd.type'

/**
 * Opening a chat from anywhere (tab bar, rail, overview) shows it: the chat page on a desktop, the
 * chat pushed over the list on a phone, with its own history entry for the back gesture.
 */
export const useChatNavigation = () => {
  const route = useRoute()
  const router = useRouter()
  const isPhone = useIsPhone()
  const chat = useChatStore()
  const { activeId } = storeToRefs(chat)
  const { activeTabId: shownTerminalId } = storeToRefs(useTerminalStore())

  const isChatRoute = computed(() => route.name === 'chat')
  /**
   * The tab whose chat is on screen; another page or a terminal tab shows none, so nothing is
   * marked current.
   */
  const shownChatId = computed(() =>
    isChatRoute.value && !shownTerminalId.value ? activeId.value : null
  )

  const showChat = (id: string) => {
    if (isPhone.value) return router.push({ name: 'chat', query: { tab: id } })
    if (!isChatRoute.value) return router.push({ name: 'chat' })
  }

  const openChat = (id: string) => {
    shownTerminalId.value = null
    activeId.value = id
    void showChat(id)
  }

  /** A finished session: its open tab, or a new tab that continues it. */
  const resumeChat = (session: SessionSummaryProps, machine: Machine) => {
    shownTerminalId.value = null
    chat.resume(session, machine)
    if (activeId.value) void showChat(activeId.value)
  }

  return { isChatRoute, shownChatId, openChat, resumeChat }
}
