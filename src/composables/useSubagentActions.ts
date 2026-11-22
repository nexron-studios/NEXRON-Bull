import { computed } from 'vue'
import { useSubagentHistory } from '@/composables/useSubagentHistory'
import { useTabInsights } from '@/composables/useTabInsights'
import type { ChatTabState } from '@/utils/chatTab'
import { historyRunsOf, subagentActionsOf, type SubagentRuns } from '@/utils/subagentActions'

/**
 * The actions of each subagent of a tab, by its Agent call id: what arrived live, completed from
 * the subagents' own transcripts (after a reload the stream has nothing of them).
 */
export const useSubagentActions = (tab: () => ChatTabState) => {
  const { subagents, liveSubagents } = useTabInsights(tab().id)
  const { transcripts } = useSubagentHistory(tab)

  const history = computed(() => historyRunsOf(transcripts.value, subagents.value))
  const actions = computed<SubagentRuns>(() =>
    Object.fromEntries(
      subagents.value.map((agent) => [
        agent.id,
        subagentActionsOf(agent, liveSubagents.value[agent.id], history.value[agent.id])
      ])
    )
  )

  return { actions }
}
