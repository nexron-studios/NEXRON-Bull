import { computed, effectScope, onScopeDispose, type EffectScope } from 'vue'
import { useChatStore } from '@/stores/chat'
import { activityStateOf, backgroundShellsOf, promptTurnOf, turnToolsOf } from '@/utils/tabActivity'
import { contextOf, subagentsOf, turnSubagentsOf } from '@/utils/tabInsights'
import { turnPlanOf } from '@/utils/todos'

const buildInsights = (tabId: string) => {
  const chat = useChatStore()

  const tab = computed(() => chat.tabs.find((t) => t.id === tabId) ?? null)
  // Every streamed token replaces the tab object but keeps these; the work below reruns only when
  // one of them actually changes, not per token.
  const messages = computed(() => tab.value?.messages ?? [])
  const contextWindow = computed(() => tab.value?.contextWindow ?? null)
  const agentNotices = computed(() => tab.value?.agentNotices ?? [])
  const isLive = computed(() => !!tab.value && tab.value.status !== 'ended')

  const context = computed(() => contextOf(messages.value, contextWindow.value))
  const backgroundTasks = computed(() => tab.value?.backgroundTasks ?? null)
  const turn = computed(() => tab.value?.turn ?? null)
  const status = computed(() => tab.value?.status ?? 'ended')
  const pending = computed(() => tab.value?.pending ?? [])
  const cutTurn = computed(() => tab.value?.cutTurn ?? null)

  const subagents = computed(() =>
    subagentsOf(messages.value, agentNotices.value, isLive.value, backgroundTasks.value)
  )
  const runningSubagents = computed(() =>
    subagents.value.filter((agent) => agent.status === 'running')
  )
  const connectors = computed(() => tab.value?.connectors ?? null)
  const liveSubagents = computed(() => tab.value?.liveSubagents ?? {})
  const backgroundShells = computed(() =>
    backgroundShellsOf(messages.value, agentNotices.value, isLive.value, backgroundTasks.value)
  )
  // The calls follow the messages; only the cheap "now" state follows every token (thinking,
  // writing and the permission change mid-message).
  const turnSource = computed(() => ({
    messages: messages.value,
    turn: turn.value,
    status: status.value,
    pending: pending.value,
    cutTurn: cutTurn.value
  }))
  const turnTools = computed(() => turnToolsOf(turnSource.value))
  // The panel's per-prompt lists ("Offen", subagents) read this; token-stable like turnTools.
  const promptTurn = computed(() => promptTurnOf(turnSource.value))
  const turnSubagents = computed(() => turnSubagentsOf(subagents.value, promptTurn.value))
  const turnPlan = computed(() => turnPlanOf(messages.value, promptTurn.value.messages))
  const activity = computed(() => {
    if (!tab.value) return null
    const { tools, recent } = turnTools.value
    return { state: activityStateOf(tab.value, turnTools.value), tools, recent }
  })

  return {
    context,
    subagents,
    promptTurn,
    turnPlan,
    turnSubagents,
    runningSubagents,
    liveSubagents,
    backgroundShells,
    activity,
    connectors
  }
}

type TabInsights = ReturnType<typeof buildInsights>

// One set of insights per tab, shared by the composer, the panel and the phone menu; dropped once
// the last of them unmounts.
const shared = new Map<string, { insights: TabInsights; scope: EffectScope; users: number }>()

/**
 * What the right panel shows about one tab: what it is doing, context size against the window,
 * its subagents, background shells and the MCP servers (connectors) of its session. Everything
 * comes from the tab's own messages and stream; nothing is fetched. The id is fixed for the caller: key the component by the tab.
 */
export const useTabInsights = (tabId: string): TabInsights => {
  let entry = shared.get(tabId)
  if (!entry) {
    const scope = effectScope(true)
    entry = { insights: scope.run(() => buildInsights(tabId)) as TabInsights, scope, users: 0 }
    shared.set(tabId, entry)
  }
  const used = entry
  used.users += 1
  onScopeDispose(() => {
    used.users -= 1
    if (used.users > 0) return
    used.scope.stop()
    shared.delete(tabId)
  })
  return used.insights
}
