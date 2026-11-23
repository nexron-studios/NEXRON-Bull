import { ref } from 'vue'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { agentdService } from '@/api/services/agentd.service'
import i18n from '@/i18n'
import { handleError } from '@/lib/error'
import { queryClient } from '@/lib/queryClient'
import { useChatStore } from '@/stores/chat'
import type { WorktreeRemoval } from '@/types/agentd.type'
import type { ChatTabState } from '@/utils/chatTab'
import { isUnknownOpError } from '@/utils/sessionActions'
import { mergeToastOf, removalToastOf, type Phrase, type WorktreeToast } from '@/utils/worktree'

/** A toast stays up long enough to read the clashing files. */
const RESULT_TOAST_MS = 10_000

/**
 * "In preview mergen" and "Worktree entfernen" for a chat that runs in a linked worktree. The
 * work happens in agentd on the chat's machine, where the repository is.
 */
export const useWorktreeActionsStore = defineStore('worktreeActions', () => {
  /** Tabs whose merge is on its way, so the menu shows it and a second click waits. */
  const mergingTabs = ref(new Set<string>())

  const { t } = i18n.global

  const say = ({ key, params, count }: Phrase) =>
    count === undefined ? t(key, params) : t(key, params, count)

  const show = ({ tone, title, notes }: WorktreeToast) => {
    const message = say(title)
    const description = notes.map(say).join(' ') || undefined
    const options = { description, duration: RESULT_TOAST_MS }
    switch (tone) {
      case 'success':
        return void toast.success(message, options)
      case 'info':
        return void toast.info(message, options)
      case 'error':
        return void toast.error(message, options)
      default: {
        const unhandled: never = tone
        throw new Error(`Unhandled toast tone: ${unhandled}`)
      }
    }
  }

  const reportFailure = (error: unknown, op: string, tab: ChatTabState) => {
    if (isUnknownOpError(error, op))
      toast.error(t('session_actions.outdated', { machine: tab.machine ?? '' }))
    else handleError(error)
  }

  // The main checkout may have moved to `preview`: every bar showing a branch asks again.
  const refreshBranches = (tab: ChatTabState) =>
    void queryClient.invalidateQueries({ queryKey: ['agentd', 'branch', tab.machine] })

  const mergeIntoPreview = async (tab: ChatTabState) => {
    if (mergingTabs.value.has(tab.id)) return
    mergingTabs.value = new Set(mergingTabs.value).add(tab.id)
    try {
      const merge = await agentdService.ask<'preview_merged'>(
        { op: 'merge_into_preview', worktree: tab.cwd },
        tab.machine
      )
      show(mergeToastOf(merge))
      refreshBranches(tab)
    } catch (error) {
      reportFailure(error, 'merge_into_preview', tab)
    } finally {
      const rest = new Set(mergingTabs.value)
      rest.delete(tab.id)
      mergingTabs.value = rest
    }
  }

  /**
   * Stops the chat's Claude (agentd refuses while it runs in the folder), then removes. A refusal
   * leaves the tab as it is; its Claude starts again with the next message. Failures go to the
   * confirmation, which reports them.
   */
  const remove = async (tab: ChatTabState): Promise<WorktreeRemoval> => {
    await useChatStore().stopAndWait(tab.id)
    const { outcome } = await agentdService.ask<'worktree_removed'>(
      { op: 'remove_worktree', worktree: tab.cwd },
      tab.machine
    )
    show(removalToastOf(outcome))
    return outcome
  }

  return { mergingTabs, mergeIntoPreview, remove }
})
