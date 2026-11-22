import { computed, inject, provide, toValue, type InjectionKey, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { fetchRewindPoints } from '@/composables/useRewindPoints'
import { useRewindStore } from '@/stores/rewind'
import type { ChatTabState } from '@/utils/chatTab'

/**
 * Whether "Bearbeiten" under a sent prompt can act: `checking` while the rewind points load (or
 * could not be read yet), `busy` while Claude works (rewinding waits for the turn), `no_point`
 * when the transcript has no rewind point for it (a slash command, a prompt not echoed yet, one
 * before a compaction).
 */
export const promptEditStateList = ['ready', 'checking', 'busy', 'no_point'] as const
export type PromptEditState = (typeof promptEditStateList)[number]

/** "Bearbeiten" under a prompt of the chat pane's tab. */
export interface PromptEdit {
  stateOf: (uuid: string) => PromptEditState
  /** Opens the rewind dialog on that prompt; going back puts its text into the composer. */
  edit: (uuid: string) => void
}

const PROMPT_EDIT: InjectionKey<PromptEdit> = Symbol('promptEdit')

/**
 * Asks agentd which prompts can be gone back to, once per state of the chat: each finished turn
 * and each rewind changes the last message, so the key renews itself. The length alone could come
 * back after a rewind and serve the answer from before it. Focusing the window asks again, so a
 * failed answer does not stick.
 */
export const usePromptEditOf = (tab: MaybeRefOrGetter<ChatTabState>): PromptEdit => {
  const rewind = useRewindStore()
  const isWorking = computed(() => {
    const { status } = toValue(tab)
    return status === 'working' || status === 'asking'
  })

  const points = useQuery({
    queryKey: [
      'agentd',
      'rewind_point_ids',
      () => toValue(tab).machine,
      () => toValue(tab).profile,
      () => toValue(tab).sessionId,
      () => toValue(tab).messages.length,
      () => toValue(tab).messages.at(-1)?.uuid
    ],
    queryFn: async () => new Set((await fetchRewindPoints(toValue(tab))).map((p) => p.uuid)),
    enabled: () => !!toValue(tab).sessionId && !isWorking.value,
    staleTime: 0,
    // The previous turn's answer holds for every older prompt; no flicker to "checking".
    placeholderData: keepPreviousData
  })

  const stateOf = (uuid: string): PromptEditState => {
    if (isWorking.value) return 'busy'
    const ids = points.data.value
    if (!ids) return 'checking'
    if (ids.has(uuid)) return 'ready'
    // The previous answer cannot know the prompt just sent; only a fresh one can say "none".
    return points.isPlaceholderData.value ? 'checking' : 'no_point'
  }

  return { stateOf, edit: (uuid) => rewind.openRewind(toValue(tab).id, uuid) }
}

// The chat pane holds both the history and the rewind dialog, so it connects the two.
export const providePromptEdit = (target: PromptEdit) => provide(PROMPT_EDIT, target)

/** `null` outside a chat pane: prompts then show no edit button. */
export const usePromptEdit = () => inject(PROMPT_EDIT, null)
