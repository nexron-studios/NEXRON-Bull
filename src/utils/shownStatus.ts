import { openQuestionOf } from '@/utils/answerCallouts'
import { backgroundAgentsOf, type ChatTabState, type TabStatus } from '@/utils/chatTab'

/**
 * The status the user sees: a chat whose answer ended while a background agent still runs works
 * on, also in the moment between the agent's end and Claude's reply to its report (Jonas,
 * 25.11.2026: "wenn ein Subagent noch läuft soll es bei Läuft angezeigt werden"). A shell does not
 * hold it, because a dev server never ends; the row names the shell instead. An error or a
 * question for the user stays what it is: both need the user more than the agent does.
 */
export const shownStatusOf = (tab: ChatTabState): TabStatus => {
  if (tab.status !== 'idle' || tab.notice !== null || openQuestionOf(tab) !== null)
    return tab.status
  const isHeld = backgroundAgentsOf(tab).length > 0 || tab.finishHold?.kind === 'agents'
  return isHeld ? 'working' : 'idle'
}

/**
 * The tab as lists show it: with its background agents as work, and during a move to another
 * account with its status from before.
 */
export const listedTabOf = (tab: ChatTabState): ChatTabState => {
  const status = tab.statusBeforeMove ?? shownStatusOf(tab)
  return status === tab.status ? tab : { ...tab, status }
}

/** Since when a busy chat runs: its turn, else the answer an agent holds, else the agent's start. */
export const runningSinceOf = (tab: ChatTabState): number | null =>
  tab.turn?.startedAt ?? tab.finishHold?.since ?? tab.backgroundTasks?.agentsSince ?? null
