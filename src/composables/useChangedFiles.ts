import { computed } from 'vue'
import { useSubagentHistory } from '@/composables/useSubagentHistory'
import { useTabInsights } from '@/composables/useTabInsights'
import { changedFilesOf, chatHunksOf, type ChangeSource } from '@/utils/changedFiles'
import type { ChatTabState } from '@/utils/chatTab'

/**
 * The files changed in a tab: by Claude in the chat and by its subagents, from their transcripts.
 * A subagent's edits have no card in the chat; a click on one shows the subagent's Agent call.
 * Edits of a subagent still running come once it finished, when its transcript is read again.
 */
export const useChangedFiles = (tab: () => ChatTabState) => {
  const { subagents } = useTabInsights(tab().id)
  const { transcripts } = useSubagentHistory(tab)

  // Every streamed token replaces the tab but keeps its messages: no new count per token.
  const messages = computed(() => tab().messages)
  const sources = computed<ChangeSource[]>(() => [
    { messages: messages.value, cardId: null },
    ...transcripts.value.map((transcript) => ({
      messages: transcript.messages,
      cardId:
        transcript.tool_use_id ??
        subagents.value.find((agent) => agent.agentId === transcript.agent_id)?.id ??
        null
    }))
  ])
  const changedFiles = computed(() => changedFilesOf(sources.value))
  /** The chat's own edits of one file, read only when the review needs them */
  const chatHunksOfFile = (key: string) => chatHunksOf(sources.value, key)

  return { changedFiles, chatHunksOfFile }
}
