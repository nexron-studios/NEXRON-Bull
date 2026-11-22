/** Where a card should land in the chat: `start` at the top, `center` in the middle. */
export type RevealBlock = 'start' | 'center'

/** Room above a card brought to the top, below the session bar or the open search. */
export const REVEAL_START_GAP_PX = 16

export interface RevealGeometry {
  /** Distance of the card's top from the scroller's content top, in px. */
  cardOffset: number
  cardHeight: number
  viewportHeight: number
  /** `scrollHeight - clientHeight`: a glide aimed past it would never arrive. */
  maxScroll: number
  /** How far something floating over the chat (the open search) covers its top, in px. */
  topInset: number
}

/** Horizontal edges and bottom of a box, in viewport px, as `getBoundingClientRect` gives them. */
interface Box {
  left: number
  right: number
  bottom: number
}

/**
 * How far a cover floating over the chat's top hides the card's column, from the chat's top
 * `viewTop`. A cover beside the card (the search sits right, a message left) hides nothing.
 */
export const topInsetOf = (
  cover: Box | null,
  card: Pick<Box, 'left' | 'right'>,
  viewTop: number
): number => {
  if (!cover || cover.right <= card.left || cover.left >= card.right) return 0
  return Math.max(0, cover.bottom - viewTop)
}

/**
 * The scroller's `scrollTop` that puts the card where `block` says, in the part of the chat that
 * nothing covers. A card taller than that part keeps its top in view, where its heading and the
 * focused control sit.
 */
export const revealTopOf = (
  { cardOffset, cardHeight, viewportHeight, maxScroll, topInset }: RevealGeometry,
  block: RevealBlock
): number => {
  // A cover over most of a short chat would push the card out at the bottom: the card wins.
  const inset = Math.min(topInset, Math.max(0, viewportHeight - cardHeight - REVEAL_START_GAP_PX))
  const startTop = cardOffset - inset - REVEAL_START_GAP_PX
  const visibleHeight = viewportHeight - inset
  const top =
    block === 'start'
      ? startTop
      : Math.min(startTop, cardOffset - inset - (visibleHeight - cardHeight) / 2)
  return Math.min(maxScroll, Math.max(0, top))
}
