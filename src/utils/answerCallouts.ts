import type { ChatMessage } from '@/types/agentd.type'
import { calloutsIn, itemsOf, quotedTextOf, type CalloutProps } from '@/utils/callouts'
import { isBusyStatus, type ChatTabState } from '@/utils/chatTab'

/** One "Offen" point from Claude's answers, for the panel's list. */
export interface OpenItemProps {
  text: string
  /** The answer it stands in */
  messageId: string
}

// Sidebar, tab bar, notifications and panel ask on every streamed token, for every tab. A finished
// message never changes (updates replace it), so its callouts are read once and kept with it; the
// WeakMap lets them go with the message. The only state in this file, and invisible from outside.
const calloutsOfMessage = new WeakMap<ChatMessage, CalloutProps[]>()

const calloutsOf = (message: ChatMessage): CalloutProps[] => {
  const known = calloutsOfMessage.get(message)
  if (known) return known
  const text = message.blocks
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n\n')
  const found = calloutsIn(text)
  calloutsOfMessage.set(message, found)
  return found
}

/**
 * The answer that ended the last turn, while the user has not written again. Only it is still
 * waiting for the user: an older answer was answered or overtaken, a streaming one is not done.
 */
export const latestAnswerOf = (tab: ChatTabState): ChatMessage | null => {
  if (isBusyStatus(tab.status) || tab.pending.length) return null
  const last = tab.messages.findLast((message) => message.role !== 'system')
  return last?.role === 'assistant' ? last : null
}

/** The question Claude ended the last turn with (`> [!question]`), until the user answers. */
export const openQuestionOf = (tab: ChatTabState): string | null => {
  const answer = latestAnswerOf(tab)
  if (!answer) return null
  const question = calloutsOf(answer).find((callout) => callout.kind === 'question')
  return question ? quotedTextOf(question) || null : null
}

/** Every "Offen" point of the chat's answers, oldest first; a point Claude repeats counts once. */
export const openItemsOf = (messages: ChatMessage[]): OpenItemProps[] => {
  const items = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) =>
      calloutsOf(message)
        .filter((callout) => callout.kind === 'todo')
        .flatMap((callout) => itemsOf(callout.body))
        .map((text) => ({ text, messageId: message.uuid }))
    )
  return items.filter(
    (item, index) => items.findIndex((other) => other.text === item.text) === index
  )
}

const MARKDOWN_LINK = /!?\[([^\]]*)\]\([^)]*\)/g
const MARKDOWN_MARKS = /[*_`~]+/g
const WHITESPACE = /\s+/g
/** Long enough for a question, short enough that no system notification cuts it off. */
const NOTIFICATION_TEXT_MAX = 140

/** A question as one plain line for a notification: no markdown marks, cut at a word. */
export const notificationTextOf = (markdown: string): string => {
  const plain = markdown
    .replace(MARKDOWN_LINK, '$1')
    .replace(MARKDOWN_MARKS, '')
    .replace(WHITESPACE, ' ')
    .trim()
  if (plain.length <= NOTIFICATION_TEXT_MAX) return plain
  const cut = plain.slice(0, NOTIFICATION_TEXT_MAX)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : cut.length)} …`
}
