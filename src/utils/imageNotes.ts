/**
 * The notes of a marked image in the draft: one line each ("① bigger"), right under the line that
 * holds the image's chip. They are found again by that place and that shape, so they can grow by
 * another round of marks and go when the image goes.
 */

/** A note line as the composer writes it: a circled number (or "(21)" past ⑳), then the note. */
const NOTE_LINE = /^(?:[①-⑳]|\(\d+\)) /

/** Where the line holding `at` ends: at its line break, or at the end of the text. */
const lineEndOf = (text: string, at: number) => {
  const end = text.indexOf('\n', at)
  return end < 0 ? text.length : end
}

/**
 * The note lines right under the line holding `at`: from the line break before the first to the
 * end of the last, or `null` when none follow.
 */
export const noteBlockAfter = (text: string, at: number): { start: number; end: number } | null => {
  const start = lineEndOf(text, at)
  let end = start
  while (end < text.length) {
    const next = lineEndOf(text, end + 1)
    if (!NOTE_LINE.test(text.slice(end + 1, next))) break
    end = next
  }
  return end > start ? { start, end } : null
}

/** The note lines under the line holding `at`, as they read. */
export const noteLinesAfter = (text: string, at: number): string[] => {
  const block = noteBlockAfter(text, at)
  return block ? text.slice(block.start + 1, block.end).split('\n') : []
}

/** `lines` under the line holding `at`, after its notes so far; what followed keeps its own line. */
export const withNoteLines = (text: string, at: number, lines: readonly string[]) => {
  const end = noteBlockAfter(text, at)?.end ?? lineEndOf(text, at)
  return `${text.slice(0, end)}\n${lines.join('\n')}${text.slice(end)}`
}

/** The text without the note lines under the line holding `at`. */
export const withoutNoteLines = (text: string, at: number) => {
  const block = noteBlockAfter(text, at)
  return block ? text.slice(0, block.start) + text.slice(block.end) : text
}
