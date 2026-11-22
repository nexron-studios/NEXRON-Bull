import type { ChatMessage, LimitState, WaitReason } from '@/types/agentd.type'
import type { ChatTabState } from '@/utils/chatTab'
import { MS_PER_MINUTE, formatHoursMinutes } from '@/utils/elapsed'

/** The tab after agentd's limit card. A move also shows in the chat, at the point it happened. */
export const withLimit = (tab: ChatTabState, state: LimitState, now: number): ChatTabState => {
  switch (state.kind) {
    case 'moved':
      // agentd sends the card again to an app that attaches later; the chat shows it once.
      if (isSameMove(tab.limit, state)) return { ...tab, limit: state }
      return {
        ...tab,
        limit: state,
        notice: null,
        profile: state.to.profile,
        account: state.to.label,
        messages: [...tab.messages, movedMessageOf(state, now)]
      }
    case 'waiting':
      // The card says it better than Claude's raw limit message, and a planned move is moot.
      return { ...tab, limit: state, notice: null, moveAfterTurn: null }
    case 'warning':
    case 'none':
      return { ...tab, limit: state }
    default: {
      const unhandled: never = state
      throw new Error(`Unhandled limit state: ${JSON.stringify(unhandled)}`)
    }
  }
}

const isSameMove = (shown: LimitState, next: Extract<LimitState, { kind: 'moved' }>): boolean =>
  shown.kind === 'moved' &&
  shown.from.profile === next.from.profile &&
  shown.to.profile === next.to.profile

const movedMessageOf = (
  state: Extract<LimitState, { kind: 'moved' }>,
  now: number
): ChatMessage => ({
  uuid: `limit-moved-${now}`,
  role: 'system',
  at: new Date(now).toISOString(),
  blocks: [{ type: 'account_moved', from: state.from, to: state.to }]
})

export const isWaitingTab = (tab: ChatTabState): boolean => tab.limit.kind === 'waiting'

/** The chats waiting for one account of one machine, for its queue at the bottom of the sidebar. */
export const waitingTabsOf = (
  tabs: ChatTabState[],
  machine: string | null,
  account: string
): ChatTabState[] =>
  tabs.filter((tab) => tab.machine === machine && tab.account === account && isWaitingTab(tab))

/** Why the chat waits, as the card explains it. */
export const waitHintKeyOf = (reason: WaitReason): string => {
  switch (reason) {
    case 'policy':
      return 'chat.limit.wait_policy'
    case 'ask':
      return 'chat.limit.wait_ask'
    case 'no_account':
      return 'chat.limit.wait_no_account'
    case 'undone':
      return 'chat.limit.wait_undone'
    default: {
      const unhandled: never = reason
      throw new Error(`Unhandled wait reason: ${unhandled}`)
    }
  }
}

/** Taking an offer: once against the rule when no allowed account had room, else a plain move. */
export const offerKeyOf = (reason: WaitReason): string =>
  reason === 'no_account' ? 'chat.limit.move_once' : 'chat.limit.move_to'

/** The reset as the card shows it: clock time and what is left (`03:25`, `3:05`); past is `null`. */
export const resetOf = (
  resetsAtMs: number | null,
  now: number,
  locale: string
): { at: string; left: string } | null => {
  if (resetsAtMs === null || resetsAtMs <= now) return null
  const at = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    resetsAtMs
  )
  // Rounded up: "0:00 left" would read as "now" a minute too early.
  const left = formatHoursMinutes(Math.ceil((resetsAtMs - now) / MS_PER_MINUTE) * MS_PER_MINUTE)
  return { at, left }
}
