/**
 * Where a mouse selection is not copied on its own: in a field the user selects to edit, and a
 * copy would overwrite what they meant to paste there. The terminal copies its own selection.
 */
const NO_COPY_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .xterm, [data-no-copy-on-select]'

/** Left button: a right click opens a context menu, it does not end a selection. */
const MAIN_BUTTON = 0

/** A mouse letting go of the main button; touch keeps the system's own selection handles. */
export const isMainMouseRelease = (event: PointerEvent): boolean =>
  event.pointerType === 'mouse' && event.button === MAIN_BUTTON

/** The text to copy, or `null` for a selection of nothing but blanks. */
export const copyableTextOf = (text: string): string | null => (text.trim() ? text : null)

/** True when the node lies in a field or another place that keeps its selection to itself. */
export const isInNoCopyArea = (node: Node | null): boolean => {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  if (!element) return false
  return element.closest(NO_COPY_SELECTOR) !== null
}

/** Where a selection starts and ends, to tell a new selection from the one copied last. */
export interface SelectionEnds {
  anchorNode: Node | null
  anchorOffset: number
  focusNode: Node | null
  focusOffset: number
}

export const selectionEndsOf = (selection: Selection): SelectionEnds => ({
  anchorNode: selection.anchorNode,
  anchorOffset: selection.anchorOffset,
  focusNode: selection.focusNode,
  focusOffset: selection.focusOffset
})

export const isSameSelection = (a: SelectionEnds | null, b: SelectionEnds): boolean =>
  a !== null &&
  a.anchorNode === b.anchorNode &&
  a.anchorOffset === b.anchorOffset &&
  a.focusNode === b.focusNode &&
  a.focusOffset === b.focusOffset
