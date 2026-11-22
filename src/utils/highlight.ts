export interface HighlightPiece {
  text: string
  isHit: boolean
}

/**
 * The text cut at Fuse's match ranges (inclusive `[start, end]` pairs), so the menu can set the
 * matched characters apart. Overlapping or unsorted ranges are fine.
 */
export const highlightPieces = (
  text: string,
  ranges: readonly (readonly [number, number])[]
): HighlightPiece[] => {
  const isHit = Array.from({ length: text.length }, () => false)
  for (const [start, end] of ranges)
    for (let at = Math.max(0, start); at <= Math.min(end, text.length - 1); at++) isHit[at] = true
  // By UTF-16 unit, as Fuse counts: an emoji before a hit must not shift it.
  return text.split('').reduce<HighlightPiece[]>((pieces, char, at) => {
    const last = pieces.at(-1)
    if (last && last.isHit === isHit[at]) {
      return [...pieces.slice(0, -1), { ...last, text: last.text + char }]
    }
    return [...pieces, { text: char, isHit: !!isHit[at] }]
  }, [])
}
