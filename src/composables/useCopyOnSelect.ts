import { useEventListener } from '@vueuse/core'
import { writeClipboard } from '@/lib/clipboard'
import { useCopyHintStore } from '@/stores/copyHint'
import {
  copyableTextOf,
  isInNoCopyArea,
  isMainMouseRelease,
  isSameSelection,
  selectionEndsOf,
  type SelectionEnds
} from '@/utils/copySelection'

/**
 * Text selected with the mouse lands on the clipboard when the button is let go, like in herdr
 * and X11 terminals (Jonas, 24.11.2026). Anywhere the app shows text to read; not in fields,
 * where selecting is editing; the terminal copies its own (`terminalSession`). Mounted once.
 */
export const useCopyOnSelect = () => {
  const hint = useCopyHintStore()
  let lastCopied: SelectionEnds | null = null

  const copySelection = async (event: PointerEvent) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    if (isInNoCopyArea(selection.anchorNode) || isInNoCopyArea(selection.focusNode)) return
    const text = copyableTextOf(selection.toString())
    if (!text) return
    // A click on a button leaves the selection as it was; that is no new selection.
    const ends = selectionEndsOf(selection)
    if (isSameSelection(lastCopied, ends)) return
    lastCopied = ends
    if (await writeClipboard(text)) hint.show(event.clientX, event.clientY)
  }

  useEventListener(document, 'pointerup', (event: PointerEvent) => {
    if (!isMainMouseRelease(event)) return
    // The browser settles the selection after pointerup: a click into a selection clears it then.
    setTimeout(() => void copySelection(event))
  })
  // Selecting the same words again after a click elsewhere copies them again.
  useEventListener(document, 'selectionchange', () => {
    if (window.getSelection()?.isCollapsed ?? true) lastCopied = null
  })
}
