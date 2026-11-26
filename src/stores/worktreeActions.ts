import { ref } from 'vue'
import { defineStore } from 'pinia'
import { toast } from '@/lib/toast'
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
 * "Merge into preview" and "Remove worktree" for a chat that runs in a linked worktree. The work
 * happens in agentd on the chat's machine, where the repository is.
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

  /** The answer to a removal, shown; true when it went (or, in a dry run, would go) through. */
  const askRemoval = async (tab: ChatTabState, root: string, isDryRun: boolean) => {
    const answer = await agentdService.ask<'worktree_removed' | 'worktree_refused'>(
      { op: 'remove_worktree', worktree: root, dry_run: isDryRun },
      tab.machine
    )
    if (answer.type === 'worktree_refused') {
      show(refusalToastOf(answer))
      return false
    }
    const { outcome } = answer
    if (outcome.kind === 'removable') return true
    show(removalToastOf(outcome))
    return outcome.kind === 'removed'
  }

  /**
   * Removes the worktree whose top folder is `root`. First asks whether that would go through, so
   * a refusal (uncommitted or unmerged work) leaves the chat's turn running; then stops the
   * chat's Claude (agentd refuses while it runs in the folder) and removes. True once it is gone.
   * Failures go to the confirmation.
   */
  const remove = async (tab: ChatTabState, root: string): Promise<boolean> => {
    if (!(await askRemoval(tab, root, true))) return false
    await useChatStore().stopAndWait(tab.id)
    return askRemoval(tab, root, false)
  }

  return { mergingTabs, mergeIntoPreview, remove }
})
