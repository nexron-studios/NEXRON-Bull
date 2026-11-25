import { nextTick, shallowRef, watch, type Ref } from 'vue'
import { useEventListener, useResizeObserver, useTimeoutFn, type EventHookOn } from '@vueuse/core'
import type { HistoryState } from '@/utils/chatTab'

/** The next older page is asked for while the top of the loaded history is this close. */
export const LOAD_AHEAD_PX = 600
/** How long a landed page keeps the view anchored while its images and code blocks settle. */
export const ANCHOR_HOLD_MS = 1000
/**
 * Sits on the stream items whose key stays when older messages load above them and holds that
 * key (`firstTurnIndexOf`). Items before them can be regrouped or folded away by the next page.
 */
export const SCROLL_ANCHOR_ATTRIBUTE = 'data-scroll-anchor'
// The reader taking the scroller over ends the hold; their own scroll is never corrected.
const READER_INPUT_EVENTS = ['wheel', 'touchmove', 'keydown', 'pointerdown']

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

/** Which page just landed: the first of a transcript, or an older one above messages on screen. */
export const landingOf = (
  previous: Pick<OlderHistoryState, 'history' | 'count'>,
  next: Pick<OlderHistoryState, 'history'>
): 'none' | 'first' | 'older' => {
  if (previous.history !== 'loading' || next.history === 'loading') return 'none'
  return previous.count > 0 ? 'older' : 'first'
}

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
  [...scroller.querySelectorAll<HTMLElement>(`[${SCROLL_ANCHOR_ATTRIBUTE}]`)].map((element) => ({
    key: element.getAttribute(SCROLL_ANCHOR_ATTRIBUTE),
    element
  }))

const offsetOf = (scroller: HTMLElement, element: HTMLElement) =>
  element.getBoundingClientRect().top - scroller.getBoundingClientRect().top

const offsetOfKey = (scroller: HTMLElement, key: string | null): number | null => {
  const item = itemsOf(scroller).find((entry) => entry.key === key)
  return item ? offsetOf(scroller, item.element) : null
}

// The first stable item starting in the view, or the last one above it while the view lies inside
// one long item. Without any (a page inside one long run) the grown height has to do.
const anchorOf = (scroller: HTMLElement): ScrollAnchor => {
  const items = itemsOf(scroller)
  const item = items.find(({ element }) => offsetOf(scroller, element) >= 0) ?? items.at(-1)
  return {
    key: item?.key ?? null,
    offset: item ? offsetOf(scroller, item.element) : 0,
    scrollHeight: scroller.scrollHeight
  }
}

const moveBy = (scroller: HTMLElement, correction: number) => {
  if (correction) scroller.scrollTop += correction
}

interface OlderHistoryOptions {
  load: () => void
  /** A follow or glide moves the list (`useChatFollow`) */
  isGliding: () => boolean
  onGlideEnd: EventHookOn<void>
}

/**
 * Loads older messages while the reader scrolls up towards the top of the loaded history, and
 * keeps what they look at in place when the page lands above it. By hand: WKWebView has no
 * `overflow-anchor`, and the scroller turns Chromium's off, so one mechanism runs everywhere.
 * Nothing loads while the list glides (a follow to the bottom passes the top on its way, the
 * reader does not); where a glide comes to rest is checked instead.
 */
export const useOlderHistory = (
  scroller: Ref<HTMLElement | null>,
  state: () => OlderHistoryState,
  { load, isGliding, onGlideEnd }: OlderHistoryOptions
) => {
  const check = () => {
    const element = scroller.value
    if (!element || isGliding()) return
    if (shouldLoadOlder(element.scrollTop, state())) load()
  }

  // The landed page's images, fonts and highlighted code grow after the first render; until the
  // reader moves, every growth is taken out again above the anchor.
  let held: ScrollAnchor | null = null
  const holdTarget = shallowRef<HTMLElement | null>(null)
  const release = () => {
    held = null
    holdTarget.value = null
  }
  const holdTimer = useTimeoutFn(release, ANCHOR_HOLD_MS, { immediate: false })
  const hold = (element: HTMLElement, anchor: ScrollAnchor) => {
    if (anchor.key === null) return
    held = anchor
    const content = element.firstElementChild
    holdTarget.value = content instanceof HTMLElement ? content : null
    holdTimer.start()
  }
  useResizeObserver(holdTarget, () => {
    const element = scroller.value
    if (!element || !held) return
    // A follow to the bottom is not to be pulled back to the anchor.
    if (isGliding()) return release()
    const offset = offsetOfKey(element, held.key)
    if (offset === null) return release()
    moveBy(element, anchorCorrectionOf(held, offset, element.scrollHeight))
  })

  useEventListener(scroller, 'scroll', check, { passive: true })
  useEventListener(scroller, READER_INPUT_EVENTS, release, { passive: true })
  onGlideEnd(check)

  // Before the render that adds the page, so the anchor is measured where the reader saw it.
  watch(
    [() => state().history, () => state().count],
    async ([history], [previousHistory, previousCount]) => {
      const element = scroller.value
      if (!element) return
      const landing = landingOf({ history: previousHistory, count: previousCount }, { history })
      if (landing === 'none') return
      if (landing === 'first') {
        // A frame later, once the follow to the bottom runs and is not mistaken for a reader at
        // the top. A first page too short to scroll gives no scroll to ask for the next one.
        await nextTick()
        requestAnimationFrame(check)
        return
      }
      release()
      const anchor = anchorOf(element)
      await nextTick()
      moveBy(
        element,
        anchorCorrectionOf(anchor, offsetOfKey(element, anchor.key), element.scrollHeight)
      )
      hold(element, anchor)
      // A short page leaves the top close by, and no scroll may follow to ask for the next one.
      check()
    },
    { flush: 'pre' }
  )
}
