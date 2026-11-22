/** Longer than this, a paste becomes a chip like the terminal's "[Pasted text +42 lines]". */
export const PASTE_CHIP_MIN_LINES = 20

/** A large paste waiting in the composer as a chip; it goes out as text with the message. */
export interface PastedText {
  id: string
  text: string
  lineCount: number
}

export const lineCountOf = (text: string): number => text.split(/\r\n|\r|\n/).length

export const isLargePaste = (text: string): boolean => lineCountOf(text) > PASTE_CHIP_MIN_LINES

/** What the message says: the typed text first, then each paste in the order it came. */
export const withPastes = (text: string, pastes: readonly PastedText[]): string =>
  [text, ...pastes.map((paste) => paste.text)].filter((part) => part.trim()).join('\n\n')
