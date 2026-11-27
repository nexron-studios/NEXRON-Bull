import { nextTick, onScopeDispose, ref, type Ref } from 'vue'
import {
  createEventHook,
  useEventListener,
  usePreferredReducedMotion,
  useResizeObserver
} from '@vueuse/core'
import { springStepOf, type SpringState } from '@/utils/motion'
import { smoothScrollStartOf } from '@/utils/scrollJump'

// Subpixel rounding: a follow that ends this close to the bottom counts as arrived.
const ARRIVAL_SLACK_PX = 2
// Below this speed, in px/s, a follow that has arrived stops instead of settling invisibly.
const FOLLOW_REST_SPEED = 20
// Any move up by more than rounding since the follow last wrote is the reader, however slow.
const READER_MOVE_PX = 0.5

/**
 * How the message list follows the conversation: it stays at the bottom while the reader is
 * there, and the scroll-down button glides back to it. Both run on one spring.
 */
export const useChatFollow = (scroller: Ref<HTMLElement | null>) => {
  const isAtBottom = ref(true)
  // The running follow: its frame and the scrollTop it last wrote, to tell the reader's scroll
  // from its own.
  let followFrame = 0
  let written = 0
  // A glide to a search hit, not the follow to the bottom: any reader scroll lets go of it, and the
  // list is not at the bottom while it runs.
  let isGlidingToHit = false
  let isDisposed = false
  // At the very end as of the last scroll; the list keeps it while it changes size.
  let isPinned = true
  // A glide that came to rest or that the reader took over; one replaced by the next does not count.
  const glideEnd = createEventHook<void>()

  const reducedMotion = usePreferredReducedMotion()

  // Follow new content only when the reader is already at the bottom, never yank them back while scrolling up.
  const isNearBottom = () => {
    const el = scroller.value
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }
  // Up from where the follow left it, and not just clamped to the bottom by shrinking content.
  const hasReaderScrolledUp = (el: HTMLElement) => {
    const bottom = el.scrollHeight - el.clientHeight
    return el.scrollTop < written - READER_MOVE_PX && el.scrollTop < bottom - READER_MOVE_PX
  }
  // A glide lets go of a scroll either way: the hit can be above or below.
  const hasReaderMoved = (el: HTMLElement) =>
    isGlidingToHit ? Math.abs(el.scrollTop - written) > READER_MOVE_PX : hasReaderScrolledUp(el)
  const stopFollow = () => {
    cancelAnimationFrame(followFrame)
    followFrame = 0
    isGlidingToHit = false
  }
  const scrollToBottom = async () => {
    await nextTick()
    stopFollow()
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
  }
  const bottomOf = (el: HTMLElement) => el.scrollHeight - el.clientHeight
  const isAtEnd = (el: HTMLElement) => bottomOf(el) - el.scrollTop <= ARRIVAL_SLACK_PX
  // The list glides on the smooth spring instead of snapping a line at a time. Each frame aims at
  // the target as it is now, so a reply that keeps growing keeps the speed it has.
  const startFollow = (el: HTMLElement, targetOf: (el: HTMLElement) => number = bottomOf) => {
    let spring: SpringState = { offset: 0, velocity: 0 }
    let last = performance.now()
    const end = () => {
      stopFollow()
      // Its own writes never let go of the end: a glide up to a search hit does, where it stops.
      isPinned = isAtEnd(el)
      void glideEnd.trigger()
    }
    const step = (now: number) => {
      if (hasReaderMoved(el)) return end()
      const target = targetOf(el)
      // Measured from the target as it is now: content that grew since the last frame widens the
      // gap, and the spring carries its speed into it instead of the list jumping by the growth.
      spring = springStepOf({ ...spring, offset: el.scrollTop - target }, now - last)
      last = now
      const hasArrived =
        Math.abs(spring.offset) < ARRIVAL_SLACK_PX && Math.abs(spring.velocity) < FOLLOW_REST_SPEED
      el.scrollTop = hasArrived ? target : target + spring.offset
      written = el.scrollTop
      if (hasArrived) return end()
      followFrame = requestAnimationFrame(step)
    }
    written = el.scrollTop
    followFrame = requestAnimationFrame(step)
  }
  // New content arrived: follow it if the reader is at the bottom or the list is following already.
  const follow = async () => {
    if (!followFrame && !isNearBottom()) return
    await nextTick()
    const el = scroller.value
    // A pane that unmounted, or a follow that started, during the wait.
    if (!el || followFrame || isDisposed) return
    if (reducedMotion.value === 'reduce') return void scrollToBottom()
    startFollow(el)
  }
  // The button glides instead of jumping (20.11.2026). A long way down jumps to
  // 1.5 screens above the end first, so the spring only covers the rest.
  const glideToBottom = () => {
    const el = scroller.value
    if (!el) return
    stopFollow()
    if (reducedMotion.value === 'reduce') return void scrollToBottom()
    el.scrollTop = smoothScrollStartOf(el.scrollTop, el.scrollHeight, el.clientHeight)
    startFollow(el)
  }

  // A search hit glides into view on the same spring; a reader scrolling lets go of it too.
  const glideTo = (top: number) => {
    const el = scroller.value
    if (!el) return
    stopFollow()
    if (reducedMotion.value === 'reduce') return void el.scrollTo({ top })
    isGlidingToHit = true
    startFollow(el, () => top)
  }

  useEventListener(
    scroller,
    'scroll',
    () => {
      const el = scroller.value
      // The reader scrolled up during a follow: it lets go.
      if (followFrame && el && hasReaderMoved(el)) stopFollow()
      isAtBottom.value = (followFrame !== 0 && !isGlidingToHit) || isNearBottom()
      // Rewrapped text moves the end without the reader: only their own scroll lets go of it.
      if (el)
        isPinned = isAtEnd(el) || (isPinned && Math.abs(el.scrollTop - written) <= READER_MOVE_PX)
    },
    { passive: true }
  )
  // A column gliding beside the chat or a resized window rewraps every message: a list that sat at
  // its end stays there in each frame instead of the newest lines sliding out under the composer.
  // Runs after layout and before paint, so no frame shows the list off its end.
  useResizeObserver(scroller, () => {
    const el = scroller.value
    if (!el || followFrame || !isPinned) return
    el.scrollTop = bottomOf(el)
    written = el.scrollTop
  })
  onScopeDispose(() => {
    isDisposed = true
    stopFollow()
  })

  /** A follow or glide is moving the list, not the reader. */
  const isGliding = () => followFrame !== 0

  return {
    isAtBottom,
    scrollToBottom,
    follow,
    glideToBottom,
    glideTo,
    isGliding,
    onGlideEnd: glideEnd.on
  }
}
