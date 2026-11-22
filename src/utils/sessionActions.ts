import type { Machine } from '@/api/services/agentd.service'
import type { SessionSummaryProps } from '@/types/agentd.type'
import { isBusyStatus, type ChatTabState } from '@/utils/chatTab'
import { hiddenKeyOf } from '@/utils/hiddenSessions'
import type { DoneSession } from '@/utils/overview'

/** A session someone wants to clear, remove or delete: an open tab, or a transcript without one. */
export interface SessionTarget {
  machine: Machine
  tab: ChatTabState | null
  title: string
  account: string
  /** `CLAUDE_CONFIG_DIR` of the account; `null` is the default profile */
  profile: string | null
  sessionId: string | null
}

/** The actions a session row, the chat's menu and the overview offer. */
export const sessionActionList = ['copy_id', 'clear', 'remove', 'delete'] as const
export type SessionAction = (typeof sessionActionList)[number]

/** The steps the user confirms first: clearing, removing a tab Claude still works in, deleting. */
export const confirmationKindList = ['clear', 'stop_and_remove', 'delete'] as const
export type ConfirmationKind = (typeof confirmationKindList)[number]

/** i18n keys of a confirmation; `notes` add what happens to a turn that is still running. */
export interface ConfirmationText {
  title: string
  body: string
  confirm: string
  notes: string[]
}

export const targetOfTab = (tab: ChatTabState): SessionTarget => ({
  machine: tab.machine,
  tab,
  title: tab.title,
  account: tab.account,
  profile: tab.profile,
  sessionId: tab.sessionId
})

export const targetOfSession = (session: SessionSummaryProps, machine: Machine): SessionTarget => ({
  machine,
  tab: null,
  title: session.title,
  account: session.account,
  profile: session.profile,
  sessionId: session.session_id
})

export const targetOfDone = (entry: DoneSession, tabs: ChatTabState[]): SessionTarget | null => {
  if (entry.source.kind === 'session') return targetOfSession(entry.source.session, entry.machine)
  const { tabId } = entry.source
  const tab = tabs.find((open) => open.id === tabId)
  return tab ? targetOfTab(tab) : null
}

/** Claude is mid-turn or starting there: it has to be stopped before the tab can go. */
export const needsStop = (target: SessionTarget): boolean =>
  !!target.tab && isBusyStatus(target.tab.status)

/** A tab that has said something; while Claude starts its session is not settled yet. */
export const canClear = (target: SessionTarget): boolean => {
  const { tab } = target
  if (!tab?.sessionId || tab.status === 'starting') return false
  return !tab.isFresh || tab.messages.length > 0
}

/** Only a session with a transcript; a tab where nothing was sent yet has none to delete. */
export const canDelete = (target: SessionTarget): boolean =>
  !!target.sessionId && !(target.tab?.isFresh ?? false)

export const isActionAvailable = (action: SessionAction, target: SessionTarget): boolean => {
  switch (action) {
    case 'copy_id':
      return !!target.sessionId
    case 'clear':
      return canClear(target)
    case 'remove':
      return true
    case 'delete':
      return canDelete(target)
    default: {
      const unhandled: never = action
      throw new Error(`Unhandled session action: ${unhandled}`)
    }
  }
}

/** What keeps the session out of the lists once its tab is gone; none before it has an id. */
export const hiddenKeysOf = (target: SessionTarget): string[] =>
  target.sessionId ? [hiddenKeyOf(target.machine, target.account, target.sessionId)] : []

/** An agentd from before `op` answers with serde's "unknown variant `op`" instead of doing it. */
export const isUnknownOpError = (error: unknown, op: string): boolean =>
  error instanceof Error && error.message.includes(`unknown variant \`${op}\``)

const runningNotesOf = (kind: ConfirmationKind, target: SessionTarget): string[] => {
  const status = target.tab?.status
  switch (kind) {
    case 'clear':
      if (status === 'asking') return ['session_actions.confirm.clear.note_asking']
      return status === 'working' ? ['session_actions.confirm.clear.note_working'] : []
    case 'stop_and_remove':
      return []
    case 'delete':
      return needsStop(target) ? ['session_actions.confirm.delete.note_running'] : []
    default: {
      const unhandled: never = kind
      throw new Error(`Unhandled confirmation: ${unhandled}`)
    }
  }
}

export const confirmationTextOf = (
  kind: ConfirmationKind,
  target: SessionTarget
): ConfirmationText => ({
  title: `session_actions.confirm.${kind}.title`,
  body: `session_actions.confirm.${kind}.body`,
  confirm: `session_actions.confirm.${kind}.confirm`,
  notes: runningNotesOf(kind, target)
})
