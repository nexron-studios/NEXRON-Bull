import { computed } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { agentdService } from '@/api/services/agentd.service'
import { useTabInsights } from '@/composables/useTabInsights'
import type { ChatTabState } from '@/utils/chatTab'

/**
 * An offline machine never answers, and an agentd from before the op answers with an error;
 * the panel then shows what arrived live.
 */
const HISTORY_TIMEOUT_MS = 10 * 1000

/**
 * The transcripts of a tab's subagents, read again whenever one more subagent finished. Shared
 * through the query key by everything that needs them (their actions, the files they changed).
 */
export const useSubagentHistory = (tab: () => ChatTabState) => {
  const { subagents } = useTabInsights(tab().id)

  const finishedCount = computed(
    () => subagents.value.filter((agent) => agent.status !== 'running').length
  )
  const sessionId = computed(() => tab().sessionId)
  const machine = computed(() => tab().machine)
  const profile = computed(() => tab().profile)

  const query = useQuery({
    queryKey: ['agentd', 'subagent_history', machine, profile, sessionId, finishedCount],
    queryFn: async () => {
      const answer = await agentdService.ask<'subagent_history'>(
        { op: 'subagent_history', profile: profile.value, session_id: sessionId.value ?? '' },
        machine.value,
        HISTORY_TIMEOUT_MS
      )
      return answer.agents
    },
    enabled: computed(() => !!sessionId.value && subagents.value.length > 0),
    // Read again through the key when a subagent finishes, not on every mount.
    staleTime: Infinity,
    retry: false,
    placeholderData: keepPreviousData
  })

  const transcripts = computed(() => query.data.value ?? [])

  return { transcripts }
}
