/** A smooth scroll covers at most this many screens; anything further is skipped first. */
export const SMOOTH_SCROLL_SCREENS = 1.5

/**
 * Where a quick smooth scroll to the bottom starts. The browser's smooth scroll takes longer the
 * further it goes, so a long way down jumps to `SMOOTH_SCROLL_SCREENS` above the end first and
 * glides only the rest; a short way glides from where the reader is.
 */
export const smoothScrollStartOf = (
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): number => {
  const end = scrollHeight - clientHeight
  const lead = clientHeight * SMOOTH_SCROLL_SCREENS
  return end - scrollTop > lead ? end - lead : scrollTop
}
