import { computed, toRef, watch, type MaybeRefOrGetter } from 'vue'
import { useEventListener, useWindowFocus } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { handleError } from '@/lib/error'
import { isWindowFocused } from '@/lib/osNotification'
import { useChatStore } from '@/stores/chat'
import {
  finishTimesOf,
  isLookingAt,
  isSameFinishTimes,
  newlyFinishedOf,
  type FinishTime
} from '@/utils/finishOrder'

/** Input that proves the user is at the window, whatever its focus events said. */
const INTERACTION_EVENTS = ['pointerdown', 'keydown']

/**
 * Gives a chat that finished while the user looked elsewhere its place in the finish order, and
 * takes it away once the chat is on screen in a focused window. Mounted once, by the shell, which
 * knows whether a chat is on screen at all (`shownId`).
 */
export const useFinishTracking = (shownId: MaybeRefOrGetter<string | null>) => {
  const chat = useChatStore()
  const { tabs } = storeToRefs(chat)
  const shownChatId = toRef(shownId)
  // Reactive focus for taking numbers away; whether the user saw a turn end asks the window itself.
  const isFocused = useWindowFocus()

  // Same array while only streamed text changes, so the watcher below skips those updates.
  const finishTimes = computed<FinishTime[]>((previous) => {
    const next = finishTimesOf(tabs.value)
    return previous && isSameFinishTimes(previous, next) ? previous : next
  })

  const noteFinished = async (id: string, at: number) => {
    // Natively: with devtools attached `document.hasFocus()` stays true while minimised.
    const isFocusedNow = await isWindowFocused()
    // The shown chat is read after the wait: the user may have opened this one meanwhile.
    if (!isLookingAt(id, shownChatId.value, isFocusedNow)) chat.markUnseen(id, at)
    // Also a chat the user watched finish: the tab bar is in finish order either way.
    chat.lineUpByFinish()
  }

  const markShownSeen = () => {
    if (shownChatId.value) chat.markSeen(shownChatId.value)
  }

  watch(finishTimes, (after, before) => {
    for (const { id, at } of newlyFinishedOf(before, after)) noteFinished(id, at).catch(handleError)
  })

  watch(
    [shownChatId, isFocused],
    ([id, focused]) => {
      if (id && focused) chat.markSeen(id)
    },
    { immediate: true }
  )

  // The shown chat can get a number while the window sits in the background, and a webview's
  // focus can miss the blur, so no focus change follows on return. A click or key press can't.
  useEventListener(window, INTERACTION_EVENTS, markShownSeen, { passive: true })
}
