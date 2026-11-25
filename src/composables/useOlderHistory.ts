import { nextTick, watch, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { HistoryState } from '@/utils/chatTab'

/** The next older page is asked for while the top of the loaded history is this close. */
export const LOAD_AHEAD_PX = 600
// Every stream item carries it for the chat search already; the anchor is found by it again.
const ITEM_KEY_ATTRIBUTE = 'data-search-key'

export interface OlderHistoryState {
  history: HistoryState
  hasMore: boolean
  /** Messages loaded so far */
  count: number
}

/** A stream item and where it sat below the scroller's top before older messages came in. */
export interface ScrollAnchor {
  key: string | null
  offset: number
  scrollHeight: number
}

/**
 * Only a loaded transcript with more behind it: a failed page waits for the retry button instead
 * of being asked for again on every scroll, and the first page is the store's to load.
 */
export const shouldLoadOlder = (
  distanceFromTop: number,
  { history, hasMore, count }: OlderHistoryState
): boolean => hasMore && count > 0 && history === 'loaded' && distanceFromTop < LOAD_AHEAD_PX

/** An older page just landed above messages that were already on screen. */
export const isOlderPageLanding = (
  previous: Pick<OlderHistoryState, 'history' | 'count'>,
  next: Pick<OlderHistoryState, 'history'>
): boolean => previous.history === 'loading' && next.history !== 'loading' && previous.count > 0

/** How far the scroller moves so the anchor sits where it sat before. */
export const anchorCorrectionOf = (
  before: ScrollAnchor,
  afterOffset: number | null,
  afterScrollHeight: number
): number =>
  before.key === null || afterOffset === null
    ? afterScrollHeight - before.scrollHeight
    : afterOffset - before.offset

const itemsOf = (scroller: HTMLElement) =>
  [...scroller.querySelectorAll<HTMLElement>(`[${ITEM_KEY_ATTRIBUTE}]`)].map((element) => ({
    key: element.getAttribute(ITEM_KEY_ATTRIBUTE),
    element
  }))

const offsetOf = (scroller: HTMLElement, element: HTMLElement) =>
  element.getBoundingClientRect().top - scroller.getBoundingClientRect().top

// The first item starting in the view, or the last one above it while the view lies inside one
// long item. Never the oldest item: the page above can join it into a group that changes its key.
// Measured on an item, not the scroll height, because Chromium (WebView2) anchors on its own and a
// height difference would move the list twice.
const anchorOf = (scroller: HTMLElement): ScrollAnchor => {
  const candidates = itemsOf(scroller).slice(1)
  const item =
    candidates.find(({ element }) => offsetOf(scroller, element) >= 0) ?? candidates.at(-1)
  return {
    key: item?.key ?? null,
    offset: item ? offsetOf(scroller, item.element) : 0,
    scrollHeight: scroller.scrollHeight
  }
}

const restore = (scroller: HTMLElement, anchor: ScrollAnchor) => {
  const item = itemsOf(scroller).find(({ key }) => key === anchor.key)
  const correction = anchorCorrectionOf(
    anchor,
    item ? offsetOf(scroller, item.element) : null,
    scroller.scrollHeight
  )
  if (correction) scroller.scrollTop += correction
}

/**
 * Loads older messages while the reader scrolls up towards the top of the loaded history, and
 * keeps what they look at in place when the page lands above it. WKWebView has no
 * `overflow-anchor`, so the scroller is moved by hand. Nothing loads while the list glides
 * (`isGliding`): a follow to the bottom passes the top on its way, the reader does not.
 */
export const useOlderHistory = (
  scroller: Ref<HTMLElement | null>,
  state: () => OlderHistoryState,
  { load, isGliding }: { load: () => void; isGliding: () => boolean }
) => {
  const check = () => {
    const element = scroller.value
    if (!element || isGliding()) return
    if (shouldLoadOlder(element.scrollTop, state())) load()
  }

  useEventListener(scroller, 'scroll', check, { passive: true })

  // Before the render that adds the page, so the anchor is measured where the reader saw it.
  watch(
    [() => state().history, () => state().count],
    async ([history], [previousHistory, previousCount]) => {
      const element = scroller.value
      if (!element) return
      if (!isOlderPageLanding({ history: previousHistory, count: previousCount }, { history }))
        return
      const anchor = anchorOf(element)
      await nextTick()
      restore(element, anchor)
      // A short page leaves the top close by, and no scroll may follow to ask for the next one.
      check()
    },
    { flush: 'pre' }
  )
}
