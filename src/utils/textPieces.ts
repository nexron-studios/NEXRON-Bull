/** What a highlighted run of text stands for: a mentioned file or an attached image. */
export type HighlightMark =
  | { kind: 'mention' }
  | {
      kind: 'image'
      /** The image's number in the reference, from 1 */
      n: number
      /** The shortened name as the reference shows it */
      name: string
      /** Thumbnail as a data URL */
      src: string
    }

export type Highlight = HighlightMark & { start: number; end: number }

export interface TextPiece {
  text: string
  /** `null` for plain text */
  mark: HighlightMark | null
}

/** The text cut into plain runs and highlights; a highlight overlapping an earlier one is left out. */
export const textPiecesOf = (text: string, highlights: readonly Highlight[]): TextPiece[] => {
  const pieces: TextPiece[] = []
  let from = 0
  for (const { start, end, ...mark } of [...highlights].sort((a, b) => a.start - b.start)) {
    if (start < from) continue
    if (start > from) pieces.push({ text: text.slice(from, start), mark: null })
    pieces.push({ text: text.slice(start, end), mark })
    from = end
  }
  if (from < text.length) pieces.push({ text: text.slice(from), mark: null })
  return pieces
}
