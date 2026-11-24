import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useTabInsights } from '@/composables/useTabInsights'
import { useChatStore } from '@/stores/chat'
import { autoCompactLeftOf, contextReportOf } from '@/utils/contextUsage'

/** Below this share of the window auto-compact is far off on every model; nothing to ask. */
const ASK_FROM_SHARE = 0.5

/** `full` counts each part with the token API, `summary` estimates from the last reply. */
type Detail = 'full' | 'summary'

const fetchReport = async (tabId: string, detail: Detail) => {
  const chat = useChatStore()
  await chat.ensureStarted(tabId)
  const report = contextReportOf(
    await chat.askClaude(tabId, { subtype: 'get_context_usage', detail })
  )
  if (!report) throw new Error('get_context_usage gave no usable answer')
  // The ring and the panel read the window from the tab, so they agree with this report.
  chat.setContextWindow(tabId, report.window)
  return report
}

/** What fills a tab's context, asked while the breakdown is open; Claude is started for it. */
export const useContextReport = (
  tabId: MaybeRefOrGetter<string>,
  isOpen: MaybeRefOrGetter<boolean>
) =>
  useQuery({
    queryKey: ['agentd', 'context', () => toValue(tabId), 'full'],
    queryFn: () => fetchReport(toValue(tabId), 'full'),
    enabled: () => toValue(isOpen),
    staleTime: 0,
    gcTime: 0,
    retry: false
  })

/**
 * How much room is left before Claude compacts on its own, once that is near; `null` before.
 * Where it compacts depends on the model and settings, so Claude is asked after every turn (a
 * cheap estimate); the tokens are the ring's, from the newest reply.
 */
export const useAutoCompactLeft = (tabId: string) => {
  const chat = useChatStore()
  const { context } = useTabInsights(tabId)
  const tab = computed(() => chat.tabs.find((t) => t.id === tabId) ?? null)

  const threshold = useQuery({
    queryKey: ['agentd', 'context', tabId, 'summary', () => tab.value?.finishedAt],
    queryFn: async () => (await fetchReport(tabId, 'summary')).autoCompactAt,
    // Only while Claude runs and rests (starting it for the hint would be too much), and only
    // once the context is half full.
    enabled: () =>
      tab.value?.status === 'idle' &&
      !!context.value &&
      context.value.tokens >= context.value.window * ASK_FROM_SHARE,
    staleTime: Infinity,
    retry: false
  })

  return computed(() => {
    const at = threshold.data.value
    return at && context.value ? autoCompactLeftOf(context.value.tokens, at) : null
  })
}
