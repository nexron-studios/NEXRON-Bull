import { imageRefsOf, type ImageRefFormat } from '@/utils/imageRefs'

/**
 * A run of a chat title: plain text, or an image reference by its number. A title has no images
 * behind its references, so the number is all that is left of one.
 */
export type TitlePiece = { kind: 'text'; text: string } | { kind: 'image'; n: number }

/** A reference cut off at the end of the title, as the first prompt shortened leaves it. */
const cutRefOf = (text: string, format: ImageRefFormat) => {
  const match = format.cutAtEnd?.exec(text)
  return match ? { start: match.index, n: Number(match.groups?.n) } : null
}

/**
 * The title cut into text and image references. Until Haiku names a chat its title is the first
 * prompt, with references like "[Bild 1 (Name…)]" in it.
 */
export const titlePiecesOf = (title: string, format: ImageRefFormat): TitlePiece[] => {
  const pieces: TitlePiece[] = []
  let from = 0
  for (const ref of imageRefsOf(title, format)) {
    if (ref.start > from) pieces.push({ kind: 'text', text: title.slice(from, ref.start) })
    pieces.push({ kind: 'image', n: ref.n })
    from = ref.end
  }
  const rest = title.slice(from)
  const cut = cutRefOf(rest, format)
  const text = cut ? rest.slice(0, cut.start) : rest
  if (text) pieces.push({ kind: 'text', text })
  if (cut) pieces.push({ kind: 'image', n: cut.n })
  return pieces
}

/** The title as plain text, each reference as its short label ("Bild 1"): tooltips, toasts. */
export const plainTitleOf = (
  title: string,
  format: ImageRefFormat,
  labelOf: (n: number) => string
): string =>
  titlePiecesOf(title, format)
    .map((piece) => (piece.kind === 'text' ? piece.text : labelOf(piece.n)))
    .join('')
