import { inject, provide, type InjectionKey } from 'vue'

/** Where the buttons of a callout in Claude's answer act. */
export interface CalloutTarget {
  /** "Antworten": the question goes into the composer as a quote, nothing is sent */
  reply: (question: string) => void
  /** "Ja, mach das" / "Nein": goes to Claude right away */
  send: (text: string) => void
  /**
   * Only the last answer of a finished turn gets buttons: an older one was answered or overtaken,
   * and a streaming one is not complete yet.
   */
  isLatestAnswer: (messageId: string) => boolean
}

const CALLOUT_TARGET: InjectionKey<CalloutTarget> = Symbol('calloutTarget')

// The chat pane holds both the history and the composer, so it connects the two.
export const provideCalloutTarget = (target: CalloutTarget) => provide(CALLOUT_TARGET, target)

/** `null` outside a chat pane: callouts then show no buttons. */
export const useCalloutTarget = () => inject(CALLOUT_TARGET, null)
