import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { useChatStore } from '@/stores/chat'
import type { ChatTabState, TabStatus } from '@/utils/chatTab'
import { appliedSettingsKey, appliedSettingsOf } from '@/utils/sessionSettings'

/** Claude runs in the tab and answers control requests, also mid-turn. */
const RUNNING_STATUS_LIST: readonly TabStatus[] = ['idle', 'working', 'asking']

/**
 * What Claude Code says a running chat runs with (`get_settings`), for the effort it picks itself
 * when neither the chat nor its account sets one; `null` while Claude does not run, since a
 * stopped chat may start with other settings. Asked at every start and mount, after every turn
 * (`/effort` typed in the chat) and once Claude took a change (`chatSettings.configure`); it never
 * starts Claude for this.
 */
export const useAppliedSettings = (tab: MaybeRefOrGetter<ChatTabState>) => {
  const chat = useChatStore()
  const isRunning = computed(() => RUNNING_STATUS_LIST.includes(toValue(tab).status))

  const query = useQuery({
    queryKey: computed(() => [
      ...appliedSettingsKey(toValue(tab).machine, toValue(tab).id),
      toValue(tab).finishedAt
    ]),
    queryFn: async () =>
      appliedSettingsOf(await chat.askClaude(toValue(tab).id, { subtype: 'get_settings' })),
    enabled: isRunning,
    // Stale at once, so a restart asks again; the window's focus does not.
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
    // The next turn's key keeps the last answer until Claude gave the new one: no blinking pill.
    placeholderData: keepPreviousData
  })

  return computed(() => (isRunning.value ? (query.data.value ?? null) : null))
}
