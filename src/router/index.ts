import { nextTick } from 'vue'
import {
  START_LOCATION,
  createRouter,
  createWebHistory,
  type RouteLocationNormalized
} from 'vue-router'
import { PHONE_QUERY } from '@/composables/useViewport'
import { pageDirectionOf } from '@/utils/navigation'
import { ROUTE_TRANSITION_ATTRIBUTE, isSkippedTransition } from '@/utils/viewTransitions'
import ChatView from '@/views/ChatView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      // The shell: sidebar, tab bar and chats stay mounted while the pages below change.
      path: '/',
      component: ChatView,
      children: [
        // The chat is the shell's own content, so this page renders nothing. `?tab=` is the chat
        // pushed over the list on a phone, a history entry for the back gesture.
        { path: '', name: 'chat', components: {} },
        // `?done=today|week|all` picks the range of finished sessions.
        {
          path: 'overview',
          name: 'overview',
          component: () => import('@/views/OverviewView.vue')
        },
        // `?days=7|14|30` picks the range.
        { path: 'usage', name: 'usage', component: () => import('@/views/UsageView.vue') },
        // `/settings` is the list of sections on a phone and the first section wider up.
        {
          path: 'settings/:section?',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue')
        }
      ]
    }
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 }
})

const matches = (query: string) => window.matchMedia(query).matches
/** Each started transition waits for its own navigation to render, keyed by that navigation. */
const finishers = new Map<RouteLocationNormalized, () => void>()
let runningTransitions = 0

const settleAll = () => {
  for (const finish of finishers.values()) finish()
  finishers.clear()
}

router.beforeResolve((to, from) => {
  // The first navigation has no old view; a query change (a chat on the phone, a range) is no
  // page change and has its own motion.
  if (from === START_LOCATION || to.path === from.path) return
  if (!document.startViewTransition) return
  // A navigation still waiting is superseded by this one: its transition may end now.
  settleAll()
  // The value says where the new page comes from; with less motion it only fades (an empty value).
  const direction = matches('(prefers-reduced-motion: reduce)')
    ? null
    : pageDirectionOf(from, to, matches(PHONE_QUERY))
  const root = document.documentElement
  root.setAttribute(ROUTE_TRANSITION_ATTRIBUTE, direction ?? '')
  runningTransitions += 1
  // The navigation waits until the browser has taken the old snapshot; changing the DOM before
  // that would capture the new page as the old one.
  return new Promise<void>((resolve) => {
    const transition = document.startViewTransition(
      () =>
        new Promise<void>((done) => {
          finishers.set(to, done)
          resolve()
        })
    )
    void transition.ready.catch((error: unknown) => {
      if (!isSkippedTransition(error)) throw error
    })
    void transition.finished.finally(() => {
      runningTransitions -= 1
      if (!runningTransitions) root.removeAttribute(ROUTE_TRANSITION_ATTRIBUTE)
    })
  })
})

// Also after a cancelled or failed navigation: its transition ends either way.
router.afterEach(async (to) => {
  const finish = finishers.get(to)
  if (!finish) return
  await nextTick()
  finish()
  finishers.delete(to)
})
router.onError(settleAll)

export default router
