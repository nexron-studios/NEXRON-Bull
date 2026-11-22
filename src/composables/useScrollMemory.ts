import { onMounted, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { createEventHook } from '@vueuse/core'
import { onBeforeRouteLeave, useRoute } from 'vue-router'

interface ScrollMark {
  /** The URL the list was left at; another search or order starts at the top instead */
  path: string
  /** Scroll position from the list's start, so a page part above it may change its height */
  offset: number
  limit: number
}

// For this run of the app only: after a restart every list starts at the top.
const marks = new Map<string, ScrollMark>()

/** Where `anchor` sits in the scroll area's content, in px. */
const offsetOf = (scroller: HTMLElement, anchor: HTMLElement) =>
  anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop

/**
 * Where a list stood when its page was left: the scroll position from the list's start and how
 * many rows it had rendered. Coming back to the same URL renders that many rows again (`limit`)
 * and scrolls back as soon as the page reaches that far, or once `isComplete` says no more rows
 * are coming (a host that never answers must not hold it back). Scrolling first cancels it. The
 * batch count stays out of the URL on purpose. `onRestored` fires right after that scroll.
 */
export const useScrollMemory = (
  key: string,
  scroller: MaybeRefOrGetter<HTMLElement | null>,
  anchor: MaybeRefOrGetter<HTMLElement | null>,
  rowCount: MaybeRefOrGetter<number>,
  isComplete: MaybeRefOrGetter<boolean>,
  renderedLimit: () => number
) => {
  const route = useRoute()
  const kept = marks.get(key)
  marks.delete(key)
  const mark = kept?.path === route.fullPath ? kept : null
  let isSettled = !mark
  const restored = createEventHook<void>()

  onBeforeRouteLeave((_to, from) => {
    const element = toValue(scroller)
    const start = toValue(anchor)
    if (!element || !start) return
    marks.set(key, {
      path: from.fullPath,
      offset: element.scrollTop - offsetOf(element, start),
      limit: renderedLimit()
    })
  })

  const restore = () => {
    const element = toValue(scroller)
    const start = toValue(anchor)
    if (isSettled || !mark || !element || !start || !toValue(rowCount)) return
    if (element.scrollTop > 0) {
      isSettled = true
      return
    }
    const top = offsetOf(element, start) + mark.offset
    const isReachable = element.scrollHeight - element.clientHeight >= top
    if (!isReachable && !toValue(isComplete)) return
    isSettled = true
    element.scrollTo({ top })
    void restored.trigger()
  }

  // After the DOM update: the new rows must be laid out before the height says anything. The
  // elements are watched too: a parent's template ref reaches a child prop one render late.
  watch(
    () => [toValue(scroller), toValue(anchor), toValue(rowCount), toValue(isComplete)],
    restore,
    { flush: 'post' }
  )
  onMounted(restore)

  return { limit: mark?.limit, onRestored: restored.on }
}
