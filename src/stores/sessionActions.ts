import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { agentdService } from '@/api/services/agentd.service'
import { useIsPhone } from '@/composables/useViewport'
import i18n from '@/i18n'
import { copyText } from '@/lib/clipboard'
import { handleError } from '@/lib/error'
import { ClearRefusedError, useChatStore } from '@/stores/chat'
import { useHiddenSessionsStore } from '@/stores/hiddenSessions'
import { useRememberedSettingsStore } from '@/stores/rememberedSettings'
import { useWorktreeActionsStore } from '@/stores/worktreeActions'
import { savedTabOf } from '@/utils/chatTab'
import { hiddenKeyOf } from '@/utils/hiddenSessions'
import {
  hiddenKeysOf,
  isUnknownOpError,
  needsStop,
  type ConfirmationKind,
  type SessionAction,
  type SessionTarget
} from '@/utils/sessionActions'

/** Long enough to reach "Rückgängig" after reading the toast. */
const UNDO_TOAST_MS = 8000

/** The agentd op behind each confirmation; an agentd without it names it in its error. */
const OP_OF = {
  clear: 'clear',
  stop_and_remove: null,
  delete: 'delete_session',
  remove_worktree: 'remove_worktree'
} as const

/** A step the user confirms in the dialog first. `sessionId` is the one they saw when asking. */
export interface SessionConfirmation {
  kind: ConfirmationKind
  target: SessionTarget
  sessionId: string | null
}

/**
 * Clearing, removing and deleting sessions, from the sidebar, the overview and a chat's menus.
 * One confirmation dialog for the whole app reads `confirmation`.
 */
export const useSessionActionsStore = defineStore('sessionActions', () => {
  const confirmation = ref<SessionConfirmation | null>(null)
  const isWorking = ref(false)

  const chat = useChatStore()
  const hidden = useHiddenSessionsStore()
  const isPhone = useIsPhone()
  const { t } = i18n.global

  /** What a session is called in menus, dialogs and toasts; a chat with no prompt yet has no title. */
  const titleOf = (target: SessionTarget) => target.title || t('chat.new_chat')

  /** The target with its tab as it is now: the dialog stays open while Claude goes on. */
  const liveTargetOf = (target: SessionTarget): SessionTarget => {
    const tab = target.tab && chat.tabs.find((open) => open.id === target.tab?.id)
    return tab ? { ...target, tab } : target
  }

  const confirmationTarget = computed(() =>
    confirmation.value ? liveTargetOf(confirmation.value.target) : null
  )

  const reportFailure = (error: unknown, { kind, target }: SessionConfirmation) => {
    const op = OP_OF[kind]
    if (error instanceof ClearRefusedError)
      toast.error(t(`session_actions.refused.${error.reason}`, { machine: target.machine ?? '' }))
    else if (op && isUnknownOpError(error, op))
      toast.error(t('session_actions.outdated', { machine: target.machine ?? '' }))
    else handleError(error)
  }

  /** On a phone no open chat is the list; closing the shown one must not push another. */
  const closeTab = (id: string) => {
    const wasShown = chat.activeId === id
    chat.close(id)
    if (isPhone.value && wasShown) chat.activeId = null
  }

  const ask = (kind: ConfirmationKind, target: SessionTarget) => {
    confirmation.value = { kind, target, sessionId: target.sessionId }
  }

  const requestClear = (target: SessionTarget) => ask('clear', target)
  const requestDelete = (target: SessionTarget) => ask('delete', target)
  const requestRemoveWorktree = (target: SessionTarget) => ask('remove_worktree', target)

  /** Closes the tabs and hides the sessions, with an undo that brings both back. */
  const hideAll = async (targets: SessionTarget[]) => {
    // Positions before anything closes: the undo puts every tab back where it was.
    const closed = targets.flatMap((target) => {
      const index = chat.tabs.findIndex((tab) => tab.id === target.tab?.id)
      return index < 0 ? [] : [{ tab: savedTabOf(chat.tabs[index]), index, target }]
    })
    for (const { tab, target } of closed) {
      if (needsStop(liveTargetOf(target))) await chat.stopAndWait(tab.id)
      closeTab(tab.id)
    }
    const keys = targets.flatMap(hiddenKeysOf)
    hidden.hide(keys)
    const message =
      targets.length === 1
        ? t('session_actions.removed_one', { title: titleOf(targets[0]) })
        : t('session_actions.removed_many', { n: targets.length })
    toast(message, {
      description: t('session_actions.removed_hint'),
      duration: UNDO_TOAST_MS,
      action: {
        label: t('session_actions.undo'),
        onClick: () => {
          hidden.unhide(keys)
          chat.restoreTabs(closed.map(({ tab, index }) => ({ tab, index })))
        }
      }
    })
  }

  /** Right away with undo; a tab whose Claude still works asks first, stopping is not undone. */
  const remove = (target: SessionTarget) => {
    if (needsStop(target)) return ask('stop_and_remove', target)
    hideAll([target]).catch(handleError)
  }

  /** "Remove all" over finished sessions: none of them has a Claude at work. */
  const removeAll = (targets: SessionTarget[]) => {
    const finished = targets.filter((target) => !needsStop(target))
    if (finished.length) hideAll(finished).catch(handleError)
  }

  /** What a menu item of a session row or a chat's menu starts. */
  const act = (action: SessionAction, target: SessionTarget) => {
    switch (action) {
      case 'copy_id':
        return target.sessionId ? void copyText(target.sessionId) : undefined
      case 'clear':
        return requestClear(target)
      case 'remove':
        return remove(target)
      case 'delete':
        return requestDelete(target)
      default: {
        const unhandled: never = action
        throw new Error(`Unhandled session action: ${unhandled}`)
      }
    }
  }

  const clear = async ({ target, sessionId }: SessionConfirmation) => {
    if (!target.tab || !sessionId) return
    await chat.clearChat(target.tab.id, sessionId)
    // The old conversation stays resumable from the new-session dialog, but the list stays short.
    hidden.hide([hiddenKeyOf(target.machine, target.account, sessionId)])
    toast.success(t('session_actions.cleared'))
  }

  const deleteForGood = async ({ target, sessionId }: SessionConfirmation) => {
    if (!sessionId) return
    const tab = target.tab ? chat.tabs.find((open) => open.id === target.tab?.id) : undefined
    if (tab && tab.sessionId !== sessionId) throw new ClearRefusedError('session_changed')
    // agentd refuses while Claude runs on the transcript; the tab is closed only once it is gone.
    if (tab) await chat.stopAndWait(tab.id)
    await agentdService.ask<'deleted'>(
      { op: 'delete_session', profile: target.profile, session_id: sessionId },
      target.machine
    )
    if (tab) closeTab(tab.id)
    useRememberedSettingsStore().forget(sessionId)
    hidden.unhide(hiddenKeysOf(target))
    chat.refreshRecent(target.machine)
    toast.success(t('session_actions.deleted', { title: titleOf(target) }))
  }

  /** The tab goes once its folder is gone: Claude could not start there again. */
  const removeWorktree = async ({ target }: SessionConfirmation) => {
    if (!target.tab) return
    const outcome = await useWorktreeActionsStore().remove(target.tab)
    if (outcome.kind === 'removed') closeTab(target.tab.id)
  }

  const run = async (current: SessionConfirmation) => {
    switch (current.kind) {
      case 'clear':
        return clear(current)
      case 'stop_and_remove':
        return hideAll([current.target])
      case 'delete':
        return deleteForGood(current)
      case 'remove_worktree':
        return removeWorktree(current)
      default: {
        const unhandled: never = current.kind
        throw new Error(`Unhandled session confirmation: ${unhandled}`)
      }
    }
  }

  const confirm = async () => {
    const current = confirmation.value
    if (!current || isWorking.value) return
    isWorking.value = true
    try {
      await run(current)
    } catch (error) {
      reportFailure(error, current)
    } finally {
      isWorking.value = false
      confirmation.value = null
    }
  }

  const cancel = () => {
    if (!isWorking.value) confirmation.value = null
  }

  return {
    confirmation,
    confirmationTarget,
    isWorking,
    titleOf,
    act,
    requestRemoveWorktree,
    removeAll,
    confirm,
    cancel
  }
})
