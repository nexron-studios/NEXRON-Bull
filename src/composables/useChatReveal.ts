import { nextTick, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { revealTopOf, topInsetOf, type RevealBlock } from '@/utils/revealScroll'

/** Sent on the element to bring into view; a folded chain around it opens on it. */
export const REVEAL_EVENT = 'nch-reveal'
const FOCUS_TARGET = 'summary, button'

interface RevealDetail {
  block: RevealBlock
}

/** DOM id of the card of one tool call in the chat. */
export const toolCardIdOf = (toolId: string): string => `tool-card-${toolId}`
/** DOM id of the approval or question card a tab waits on. */
export const approvalIdOf = (tabId: string): string => `approval-${tabId}`

/**
 * Brings a tool card or the open approval into view, from outside the chat (the panel, the phone
 * sheet). Goes through the DOM by id: the panel and the chat share no component tree. The chat
 * does the scrolling itself, see `useRevealTarget`.
 */
export const useChatReveal = () => {
  // `start` puts the card at the top, so the calls after it follow below.
  const reveal = async (id: string, block: RevealBlock = 'center'): Promise<void> => {
    const element = document.getElementById(id)
    if (!element) return
    element.dispatchEvent(
      new CustomEvent<RevealDetail>(REVEAL_EVENT, { bubbles: true, detail: { block } })
    )
    await nextTick()
    // Keyboard users land on the card, not back at the top of the page.
    element.querySelector<HTMLElement>(FOCUS_TARGET)?.focus({ preventScroll: true })
  }

  return {
    revealTool: (toolId: string, block?: RevealBlock) => reveal(toolCardIdOf(toolId), block),
    revealApproval: (tabId: string) => reveal(approvalIdOf(tabId))
  }
}

/**
 * The chat's side of a reveal: scrolls only its own list, through `glideTo`. `scrollIntoView`
 * also scrolled the clipped layout around the chat once the list could not scroll further and
 * shifted the whole pane up, and a native smooth scroll gets cancelled by the follow spring
 * while a turn streams. `coverOf` gives what floats over the chat's top (the open search, viewport
 * px, `null` when nothing does); a card beneath it lands below it.
 */
export const useRevealTarget = (
  scroller: Ref<HTMLElement | null>,
  glideTo: (top: number) => void,
  coverOf: () => DOMRect | null = () => null
) =>
  useEventListener(scroller, REVEAL_EVENT, async (event: Event) => {
    const card = event.target
    if (!(event instanceof CustomEvent) || !(card instanceof HTMLElement)) return
    const { block } = event.detail as RevealDetail
    // A folded group around the card opens on the same event first.
    await nextTick()
    const el = scroller.value
    if (!el) return
    const viewTop = el.getBoundingClientRect().top
    const cardRect = card.getBoundingClientRect()
    glideTo(
      revealTopOf(
        {
          cardOffset: cardRect.top - viewTop + el.scrollTop,
          cardHeight: card.offsetHeight,
          viewportHeight: el.clientHeight,
          maxScroll: el.scrollHeight - el.clientHeight,
          topInset: topInsetOf(coverOf(), cardRect, viewTop)
        },
        block
      )
    )
  })
