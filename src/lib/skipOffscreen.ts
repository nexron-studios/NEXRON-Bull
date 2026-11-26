import type { Directive } from 'vue'

// `auto`: the element keeps the size it was last laid out with while the browser skips it.
// `none`: nothing to fall back on, but it is only skipped after its first layout anyway.
const REMEMBERED_SIZE = 'auto none'
const SKIPPED_SELECTOR = '[data-skip-offscreen]'

/** Lets the browser skip the element once it was laid out a frame with its size remembered. */
const arm = (el: HTMLElement) => {
  el.style.containIntrinsicSize = REMEMBERED_SIZE
  // The first frame lays the element out and records its size at its end; the second may skip it.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.style.contentVisibility = 'auto'
    })
  )
}

/**
 * `v-skip-offscreen`: the browser skips layout and paint of the element while it is off screen
 * (`content-visibility: auto`). Long chats keep hundreds of messages in the DOM; every token
 * Claude streams otherwise laid them all out again. Switched on only after the first layout, so
 * the size the element keeps is its real one: with a guessed height, a message above the view
 * would grow or shrink once scrolled to and move the text being read, and WKWebView has no
 * scroll anchoring to hide that.
 */
export const vSkipOffscreen: Directive<HTMLElement> = {
  mounted: (el) => {
    el.dataset.skipOffscreen = ''
    arm(el)
  }
}

/**
 * Skipped elements keep the height they had at the old width. Once the width has changed, every
 * one is laid out again; call `rearm` when the width has settled.
 */
export const pauseSkipping = (root: HTMLElement) => {
  for (const el of root.querySelectorAll<HTMLElement>(SKIPPED_SELECTOR))
    el.style.contentVisibility = ''
}

export const rearmSkipping = (root: HTMLElement) => {
  for (const el of root.querySelectorAll<HTMLElement>(SKIPPED_SELECTOR)) arm(el)
}
