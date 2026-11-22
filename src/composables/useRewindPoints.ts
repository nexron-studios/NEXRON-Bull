import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { agentdService } from '@/api/services/agentd.service'
import { useChatStore } from '@/stores/chat'
import type { RewindPointProps } from '@/types/agentd.type'
import type { ChatTabState } from '@/utils/chatTab'
import { filesOfRewind } from '@/utils/rewind'

/** The prompts of a tab's session it can go back to, oldest first, read from its transcript. */
export const fetchRewindPoints = async (
  tab: Pick<ChatTabState, 'machine' | 'profile' | 'sessionId'>
): Promise<RewindPointProps[]> => {
  if (!tab.sessionId) return []
  const { points } = await agentdService.ask<'rewind_points'>(
    { op: 'rewind_points', profile: tab.profile, session_id: tab.sessionId },
    tab.machine
  )
  return points
}

/**
 * What the rewind dialog shows for one tab: the prompts it can go back to, newest first, and for
 * the chosen one the files that would come back. Asked fresh each time the dialog opens, since
 * every turn adds a prompt. The file preview needs Claude running and is skipped otherwise.
 */
export const useRewindPoints = (
  tabId: MaybeRefOrGetter<string>,
  isOpen: MaybeRefOrGetter<boolean>,
  chosen: MaybeRefOrGetter<string | null>
) => {
  const chat = useChatStore()
  const tab = computed(() => chat.tabs.find((t) => t.id === toValue(tabId)) ?? null)

  const points = useQuery({
    queryKey: [
      'agentd',
      'rewind_points',
      () => tab.value?.machine,
      () => tab.value?.profile,
      () => tab.value?.sessionId
    ],
    queryFn: async () => (tab.value ? [...(await fetchRewindPoints(tab.value))].reverse() : []),
    enabled: () => toValue(isOpen) && !!tab.value?.sessionId,
    staleTime: 0,
    gcTime: 0
  })

  const preview = useQuery({
    queryKey: ['agentd', 'rewind_preview', () => toValue(tabId), () => toValue(chosen)],
    // No checkpoint means no files to name; the dialog then speaks of files in general.
    queryFn: async () => {
      const outcome = filesOfRewind(
        await chat.askClaude(toValue(tabId), {
          subtype: 'rewind_files',
          user_message_id: toValue(chosen),
          dry_run: true
        })
      )
      return outcome.isDone ? outcome.value : null
    },
    enabled: () => toValue(isOpen) && !!toValue(chosen) && tab.value?.status === 'idle',
    staleTime: 0,
    gcTime: 0,
    retry: false
  })

  return { points, preview }
}
