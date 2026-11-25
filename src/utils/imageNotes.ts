import type { RefImage } from '@/utils/imageRefs'

/**
 * The notes of marked images in the draft: one line each, under the line that holds the image's
 * chip, and each naming its image in plain text ("Bild 2: ① smaller"). The name is what ties a
 * line to its image, not where it stands, so two chips may share a line and their notes a block;
 * the number follows the image like the chip's does, and the line goes when the image goes.
 */

/** Stand-ins for image number and note in the locale's template ("Bild {n}: {note}"). */
export const NOTE_LINE_SLOTS = { n: '\u0001', note: '\u0003' } as const

/** A note as the marks give it: a circled number (or "(21)" past ⑳), then the text. */
const NOTE = '(?:[\\u2460-\\u2473]|\\(\\d+\\)) .*'

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** How a note line reads in the current locale, and how to read one back. */
export interface NoteLineFormat {
  render: (n: number, note: string) => string
  /** Image number (from 1) and note of a whole line, or `null` for any other line */
  parse: (line: string) => { n: number; note: string } | null
}

export const noteLineFormatOf = (template: string): NoteLineFormat => {
  const pattern = new RegExp(
    `^${escapeRegExp(template)
      .replace(NOTE_LINE_SLOTS.n, '(?<n>\\d+)')
      .replace(NOTE_LINE_SLOTS.note, `(?<note>${NOTE})`)}$`
  )
  return {
    render: (n, note) =>
      template.replace(NOTE_LINE_SLOTS.n, String(n)).replace(NOTE_LINE_SLOTS.note, () => note),
    parse: (line) => {
      const groups = pattern.exec(line)?.groups
      return groups?.n && groups.note ? { n: Number(groups.n), note: groups.note } : null
    }
  }
}

/** The notes of image `n`, wherever their lines stand, in their order. */
export const notesOfImage = (text: string, n: number, format: NoteLineFormat): string[] =>
  text.split('\n').flatMap((line) => {
    const parsed = format.parse(line)
    return parsed?.n === n ? [parsed.note] : []
  })

/**
 * Notes of image `n` under the line holding `at`. Note lines already there stay, sorted by image:
 * the new ones go after the last line of an image up to `n`, so image 1's notes stay above image
 * 2's whichever was marked first. What followed keeps its own line.
 */
export const withImageNotes = (
  text: string,
  at: number,
  n: number,
  notes: readonly string[],
  format: NoteLineFormat
) => {
  const lines = text.split('\n')
  const chipLine = text.slice(0, at).split('\n').length - 1
  let insertAt = chipLine + 1
  for (let line = chipLine + 1; line < lines.length; line++) {
    const parsed = format.parse(lines[line] ?? '')
    if (!parsed) break
    if (parsed.n <= n) insertAt = line + 1
  }
  lines.splice(insertAt, 0, ...notes.map((note) => format.render(n, note)))
  return lines.join('\n')
}

/**
 * The note lines once the attachments went from `before` to `after`, like the references: each
 * gets its image's new number, or goes when its image went. `successors` points a replaced image
 * at the one that took its place. A line naming no attachment stays as it is.
 */
export const remapNoteLines = (
  text: string,
  before: readonly RefImage[],
  after: readonly RefImage[],
  format: NoteLineFormat,
  successors: Readonly<Record<string, string>> = {}
) =>
  text
    .split('\n')
    .flatMap((line) => {
      const parsed = format.parse(line)
      const image = parsed ? before[parsed.n - 1] : undefined
      if (!parsed || !image) return [line]
      const id = successors[image.id] ?? image.id
      const at = after.findIndex((next) => next.id === id)
      return at < 0 ? [] : [format.render(at + 1, parsed.note)]
    })
    .join('\n')
