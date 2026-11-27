import { nextTick } from 'vue'
import { ROUTE_TRANSITION_ATTRIBUTE } from '@/utils/viewTransitions'

/** On `<html>` while a column glides to its new width; only then do columns transition it. */
export const LAYOUT_GLIDE_ATTRIBUTE = 'data-layout-glide'
// Fallback only: the length is the --duration-spring-smooth token in motion.css.
const GLIDE_MS_FALLBACK = 410

// One timer for every column: a glide that starts while another runs keeps the attribute on until
// the later one has arrived.
let releaseTimer: ReturnType<typeof setTimeout> | undefined

const glideMsOf = (root: HTMLElement) =>
  Number.parseFloat(getComputedStyle(root).getPropertyValue('--duration-spring-smooth')) ||
  GLIDE_MS_FALLBACK

/**
 * Applies `update`, gliding when it shows `isNewLayout`; resolves once it is rendered. Animates a
 * column beside the chat opening, shutting or changing size (sidebar rail and panel,
 * preview, info panel) through its real width on the smooth spring (transitions.css). The chat is
 * laid out every frame, so its centred messages and composer travel with the edge and its text
 * rewraps as in a window resize. A View Transition cross-faded two pictures of the chat instead,
 * pinned to its left edge: the messages showed twice and jumped by half the column's width.
 * Dragging an edge within one layout follows the pointer 1:1, because the attribute exists only
 * while a glide runs; a drag across a snap point (panel to rail) glides there. A second glide
 * mid-way retargets from where the width is. During a page change, which shows snapshots, and under
 * reduced motion (main.css) the width changes at once.
 */
export const glideLayout = (update: () => void, isNewLayout: boolean): Promise<void> => {
  const root = document.documentElement
  if (!isNewLayout || root.hasAttribute(ROUTE_TRANSITION_ATTRIBUTE)) {
    update()
    return nextTick()
  }
  root.setAttribute(LAYOUT_GLIDE_ATTRIBUTE, '')
  update()
  clearTimeout(releaseTimer)
  releaseTimer = setTimeout(() => root.removeAttribute(LAYOUT_GLIDE_ATTRIBUTE), glideMsOf(root))
  return nextTick()
}
