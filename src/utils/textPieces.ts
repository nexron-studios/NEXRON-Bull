/** What a highlighted run of text stands for: a mentioned file or an attached image. */
export const highlightKindList = ['mention', 'image'] as const
export type HighlightKind = (typeof highlightKindList)[number]

export interface Highlight {
  start: number
  end: number
  kind: HighlightKind
}

export interface TextPiece {
  text: string
  /** `null` for plain text */
  kind: HighlightKind | null
}

/** The text cut into plain runs and highlights; a highlight overlapping an earlier one is left out. */
export const textPiecesOf = (text: string, highlights: readonly Highlight[]): TextPiece[] => {
  const pieces: TextPiece[] = []
  let from = 0
  for (const { start, end, kind } of [...highlights].sort((a, b) => a.start - b.start)) {
    if (start < from) continue
    if (start > from) pieces.push({ text: text.slice(from, start), kind: null })
    pieces.push({ text: text.slice(start, end), kind })
    from = end
  }
  if (from < text.length) pieces.push({ text: text.slice(from), kind: null })
  return pieces
}
