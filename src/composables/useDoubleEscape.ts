import { useEventListener } from '@vueuse/core'
import { isDoubleEscape, isFreeEscape, POPUP_SELECTOR } from '@/utils/escape'

/**
 * Calls `onDouble` when Esc is pressed twice in quick succession, as in the terminal. Esc that
 * closes a dialog, menu or list belongs to it and starts nothing; any other key starts over.
 */
export const useDoubleEscape = (isEnabled: () => boolean, onDouble: () => void) => {
  // Plain, not a ref: nothing renders from it.
  let firstAt: number | null = null
  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    const hasOpenPopup = !!document.querySelector(POPUP_SELECTOR)
    if (!isEnabled() || !isFreeEscape(event, hasOpenPopup)) {
      firstAt = null
      return
    }
    const now = Date.now()
    if (!isDoubleEscape(firstAt, now)) {
      firstAt = now
      return
    }
    firstAt = null
    onDouble()
  })
}
