import { ref } from 'vue'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { agentdService } from '@/api/services/agentd.service'
import { reportAgentdFailure } from '@/lib/error'
import { queryClient } from '@/lib/queryClient'
import { say } from '@/lib/worktreeText'
import { useChatStore } from '@/stores/chat'
import type { ChatTabState } from '@/utils/chatTab'
import { mergeToastOf, refusalToastOf, removalToastOf, type WorktreeToast } from '@/utils/worktree'

/** A toast stays up long enough to read the clashing files. */
const RESULT_TOAST_MS = 10_000

/**
 * "In preview mergen" and "Worktree entfernen" for a chat that runs in a linked worktree. The
 * work happens in agentd on the chat's machine, where the repository is.
 */
export const useWorktreeActionsStore = defineStore('worktreeActions', () => {
  /** Tabs whose merge is on its way, so the menu shows it and a second click waits. */
  const mergingTabs = ref(new Set<string>())

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

  // The main checkout may have moved to `preview`: every bar showing a branch asks again.
  const refreshBranches = (tab: ChatTabState) =>
    void queryClient.invalidateQueries({ queryKey: ['agentd', 'branch', tab.machine] })

  const mergeIntoPreview = async (tab: ChatTabState) => {
    if (mergingTabs.value.has(tab.id)) return
    mergingTabs.value = new Set(mergingTabs.value).add(tab.id)
    try {
      const answer = await agentdService.ask<'preview_merged' | 'worktree_refused'>(
        { op: 'merge_into_preview', worktree: tab.cwd },
        tab.machine
      )
      show(answer.type === 'preview_merged' ? mergeToastOf(answer) : refusalToastOf(answer))
      refreshBranches(tab)
    } catch (error) {
      reportAgentdFailure(error, 'merge_into_preview', tab.machine)
    } finally {
      const rest = new Set(mergingTabs.value)
      rest.delete(tab.id)
      mergingTabs.value = rest
    }
  }

  /**
   * Stops the chat's Claude (agentd refuses while it runs in the folder), then removes the
   * worktree whose top folder is `root`. True once it is gone; a refusal leaves the tab as it is,
   * its Claude starts again with the next message. Failures go to the confirmation.
   */
  const remove = async (tab: ChatTabState, root: string): Promise<boolean> => {
    await useChatStore().stopAndWait(tab.id)
    const answer = await agentdService.ask<'worktree_removed' | 'worktree_refused'>(
      { op: 'remove_worktree', worktree: root },
      tab.machine
    )
    if (answer.type === 'worktree_refused') {
      show(refusalToastOf(answer))
      return false
    }
    show(removalToastOf(answer.outcome))
    return answer.outcome.kind === 'removed'
  }

  return { mergingTabs, mergeIntoPreview, remove }
})
