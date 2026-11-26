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

/** Characters put into the draft for the time being, to be taken out again exactly. */
export interface Inserted {
  at: number
  text: string
}

/** `withTranscript`, and which characters that added where. */
export const withInterim = (
  text: string,
  at: number,
  transcript: string
): TextEdit & { inserted: Inserted } => {
  const edit = withTranscript(text, at, transcript)
  const cut = Math.min(Math.max(at, 0), text.length)
  const added = edit.text.slice(cut, cut + edit.text.length - text.length)
  return { ...edit, inserted: { at: cut, text: added } }
}

/** Where `added` sits in `text` closest to `at`, or -1 when it is not there at all. */
const nearestIndexOf = (text: string, added: string, at: number): number => {
  let nearest = -1
  for (let i = text.indexOf(added); i !== -1; i = text.indexOf(added, i + 1)) {
    if (nearest === -1 || Math.abs(i - at) < Math.abs(nearest - at)) nearest = i
  }
  return nearest
}

/**
 * `inserted` taken out of `text` again, caret where it was; unchanged when it is gone already.
 * A quote or a dropped file can change the draft mid-dictation and move the words, so they are
 * looked for where they ended up, nearest to where they were put.
 */
export const withoutInserted = (text: string, { at, text: added }: Inserted): TextEdit => {
  const found = nearestIndexOf(text, added, at)
  if (found === -1) return { text, caret: Math.min(at, text.length) }
  return { text: text.slice(0, found) + text.slice(found + added.length), caret: found }
}

/** The words of an interim insert, without the spaces around them. */
export const interimRangeOf = ({ at, text }: Inserted): { start: number; end: number } => ({
  start: at + text.length - text.trimStart().length,
  end: at + text.trimEnd().length
})
