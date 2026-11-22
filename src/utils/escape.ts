import type { TabStatus } from '@/utils/chatTab'

/** Places where Esc already means something else: leaving a field, closing a dialog or menu. */
const OWNS_ESCAPE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"], [role="listbox"]'

export type EscapeEvent = Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'isComposing' | 'target'>

/**
 * Whether Esc stops Claude, like in the terminal. Not while Claude asks (the card is the
 * answer) and not from a field or popup that handles Esc itself.
 */
export const shouldStopOnEscape = (event: EscapeEvent, status: TabStatus): boolean => {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return false
  if (status !== 'working') return false
  return !(event.target instanceof Element && event.target.closest(OWNS_ESCAPE))
}

/** Two presses of Esc within this count as one Esc Esc, as in the terminal. */
export const DOUBLE_ESCAPE_MS = 500

/**
 * Esc with nothing open to close: the composer itself may have focus, it gives Esc no meaning. A
 * held key repeats and is no second press.
 */
export const isFreeEscape = (
  event: EscapeEvent & Partial<Pick<KeyboardEvent, 'repeat'>>,
  hasOpenPopup: boolean
): boolean =>
  event.key === 'Escape' &&
  !event.repeat &&
  !event.defaultPrevented &&
  !event.isComposing &&
  !hasOpenPopup

/** The Esc at `now` completes an Esc Esc begun at `firstAt`. */
export const isDoubleEscape = (firstAt: number | null, now: number): boolean =>
  firstAt !== null && now - firstAt <= DOUBLE_ESCAPE_MS

/** What closes on Esc on its own; while one is open, Esc belongs to it. */
export const POPUP_SELECTOR =
  '[role="dialog"], [role="menu"], [role="listbox"], [role="alertdialog"]'
