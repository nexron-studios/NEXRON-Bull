/** An element that takes typed text, whose keys (letters, arrows, undo) are its own. */
export const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
