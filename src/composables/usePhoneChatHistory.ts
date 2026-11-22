import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useIsPhone } from '@/composables/useViewport'
import { useChatStore } from '@/stores/chat'

/**
 * On a phone an open chat is `/?tab=<id>`, a history entry above the list: the system back
 * gesture (and Android back) returns to the list instead of leaving the app. The store's
 * `activeId` stays the one source the screens read; this keeps it and the URL in step.
 * A desktop shows tabs side by side and changes no history.
 */
export const usePhoneChatHistory = () => {
  const route = useRoute()
  const router = useRouter()
  const isPhone = useIsPhone()
  const { tabs, activeId } = storeToRefs(useChatStore())

  const routeTab = computed(() =>
    route.name === 'chat' && typeof route.query.tab === 'string' ? route.query.tab : null
  )

  // The way back is the entry below, so forward still reopens the chat. Without one (the app was
  // opened on a chat link), the chat entry becomes the list.
  const leaveChat = () => {
    if (window.history.state?.back) router.back()
    else void router.replace({ name: 'chat' })
  }

  const hasTab = (id: string) => tabs.value.some((tab) => tab.id === id)

  // On start a chat named in the URL (a reload, a link) wins over the one saved with the tabs.
  if (isPhone.value && routeTab.value && hasTab(routeTab.value)) activeId.value = routeTab.value

  // URL → store: back, forward, or a chat opened from another page.
  watch(routeTab, (id) => {
    if (!isPhone.value) return
    // A history entry of a tab closed since then.
    if (id && !hasTab(id)) return void router.replace({ name: 'chat' })
    activeId.value = id
  })

  // Store → URL: a row tapped, a new session, the in-app back button, a tab closed. Also on
  // start and when the window narrows to a phone with a chat open, so back has an entry to undo.
  watch(
    [activeId, isPhone, () => route.name],
    ([id, isNowPhone, name]) => {
      if (!isNowPhone || name !== 'chat' || id === routeTab.value) return
      if (id) void router.push({ name: 'chat', query: { tab: id } })
      else leaveChat()
    },
    { immediate: true }
  )
}
