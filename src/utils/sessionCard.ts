import { openQuestionOf } from '@/utils/answerCallouts'
import { isBusyStatus, turnMessagesOf, type ChatTabState, type TabStatus } from '@/utils/chatTab'
import { summaryOf } from '@/utils/finishOrder'
import { isPromptEcho } from '@/utils/pendingPrompts'
import { promptTextsOf } from '@/utils/promptHistory'
import { rowActivityOf, type RowActivity } from '@/utils/sessionList'

/** A running card's status; `question`: Claude finished on a question for the user. */
export type CardStatus = Extract<TabStatus, 'asking' | 'working' | 'starting'> | 'question'

type PromptSource = Pick<ChatTabState, 'messages' | 'pending' | 'history' | 'hasMore'>

/**
 * The prompts a running card shows (Agent Dashboard "SessionCard"). `first` and `count` need the
 * whole transcript: a tab that reattached without reading it, or holds only its newest page,
 * would name a later prompt the first one and count too few, so both stay `null` then.
 */
export interface CardPrompts {
  first: string | null
  last: string | null
  count: number | null
}

/** What a card's last line says: what Claude does right now, or the start of its last answer. */
export type CardStep =
  | { kind: 'activity'; activity: RowActivity; isApproval: boolean }
  | { kind: 'reply'; text: string }
  | { kind: 'none' }

/**
 * The overview lists busy tabs and finished ones whose answer ends on a question; a tab that just
 * ended keeps the work label until the list drops it.
 */
export const cardStatusOf = (tab: ChatTabState): CardStatus => {
  if (!isBusyStatus(tab.status) && openQuestionOf(tab) !== null) return 'question'
  return tab.status === 'asking' || tab.status === 'starting' ? tab.status : 'working'
}

const WHITESPACE = /\s+/g

/** A prompt on the card's few lines: its line breaks would only cut it shorter. */
const oneLineOf = (text: string): string => text.replace(WHITESPACE, ' ').trim()

const hasWholeTranscript = ({ history, hasMore }: PromptSource): boolean =>
  history === 'loaded' && !hasMore

export const cardPromptsOf = (tab: PromptSource): CardPrompts => {
  // Pending prompts are already sent; the user counts them before Claude echoes them.
  const texts = promptTextsOf([...tab.messages, ...tab.pending]).map(oneLineOf)
  const last = texts.at(-1) ?? null
  if (!hasWholeTranscript(tab)) return { first: null, last, count: null }
  return {
    first: texts[0] ?? null,
    last,
    count: tab.messages.filter(isPromptEcho).length + tab.pending.length
  }
}

/**
 * "Gestartet mit: …" only adds something when the first prompt is neither the last one (shown
 * below) nor what the title was cut from; Claude's own title replaces that one later.
 */
export const startPromptOf = (title: string, { first, last }: CardPrompts): string | null => {
  if (!first || first === last) return null
  if (title && first.startsWith(oneLineOf(title))) return null
  return first
}

/**
 * A busy tab shows its tool call, approval or question first, like the dashboard's last action;
 * while Claude only thinks or writes, the answer it gave in this turn says more. A finished tab
 * shows its last answer.
 */
export const cardStepOf = (tab: ChatTabState): CardStep => {
  const isBusy = isBusyStatus(tab.status)
  const activity = isBusy ? rowActivityOf(tab) : null
  if (activity && activity.kind !== 'state')
    return { kind: 'activity', activity, isApproval: tab.permission !== null }
  const reply = summaryOf(isBusy ? turnMessagesOf(tab) : tab.messages)
  if (reply) return { kind: 'reply', text: reply }
  return activity ? { kind: 'activity', activity, isApproval: false } : { kind: 'none' }
}
