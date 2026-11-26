import type { DictationErrorCode } from '@/api/services/dictation.service'

/** One press of Space: which one, where the caret was, and the selection its space replaced. */
export interface SpacePress {
  id: number
  /** Where the held key typed its space and where the transcript goes */
  anchor: number
  /** Selected text the typed space replaced; it comes back when the dictation yields nothing */
  replaced: string
}

/** Hold Space in the composer to dictate (`useSpaceDictation`). */
export type DictationState =
  /** Space is down and typed a normal space; still a tap. */
  | { kind: 'pressed'; press: SpacePress }
  /** Bull holds Space in the hidden Claude too, which needs a moment before it records. */
  | { kind: 'engaged'; press: SpacePress }
  /** Held long enough: a dictation, the typed space is gone. Claude is not recording yet. */
  | { kind: 'arming'; press: SpacePress }
  | { kind: 'recording'; press: SpacePress }
  | { kind: 'transcribing'; press: SpacePress }
  | { kind: 'error'; code: DictationErrorCode }
  | { kind: 'idle' }

/** The states the composer shows. */
export type DictationIndicator = Extract<
  DictationState,
  { kind: 'arming' | 'recording' | 'transcribing' | 'error' }
>['kind']

type KeyInfo = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

/** Plain Space: with a modifier it is someone's shortcut, not a dictation. */
export const isSpaceKey = (event: KeyInfo): boolean =>
  event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey

export interface TextEdit {
  text: string
  caret: number
}

/** The space the held key typed at `at`, gone again; the text as it is when none is there. */
export const withoutHeldSpace = (text: string, at: number): TextEdit =>
  text[at] === ' '
    ? { text: text.slice(0, at) + text.slice(at + 1), caret: at }
    : { text, caret: Math.min(at, text.length) }

/** The selection a held space replaced, back at `at` with the caret behind it. */
export const withRestored = (text: string, at: number, replaced: string): TextEdit => {
  const cut = Math.min(Math.max(at, 0), text.length)
  return {
    text: `${text.slice(0, cut)}${replaced}${text.slice(cut)}`,
    caret: cut + replaced.length
  }
}

// No space in front after a space or an opening bracket or quote, and none behind before a space,
// a closing bracket or punctuation. Straight quotes open as often as they close, so they count
// as neither.
const NO_SPACE_AFTER = /[\s([{„‚«]$/u
const NO_SPACE_BEFORE = /^[\s.,;:!?)\]}…“‘»]/u
const STARTS_WITH_PUNCTUATION = /^[.,;:!?…]/u

/** The transcript at `at`, a space on either side where words would touch; caret behind it. */
export const withTranscript = (text: string, at: number, transcript: string): TextEdit => {
  const words = transcript.trim()
  const cut = Math.min(Math.max(at, 0), text.length)
  if (!words) return { text, caret: cut }
  const before = text.slice(0, cut)
  const after = text.slice(cut)
  const lead = before && !NO_SPACE_AFTER.test(before) && !STARTS_WITH_PUNCTUATION.test(words)
  const trail = after && !NO_SPACE_BEFORE.test(after)
  const inserted = `${lead ? ' ' : ''}${words}`
  return { text: `${before}${inserted}${trail ? ' ' : ''}${after}`, caret: cut + inserted.length }
}
