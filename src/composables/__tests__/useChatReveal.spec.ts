import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { REVEAL_EVENT, useRevealTarget } from '../useChatReveal'

const define = (el: HTMLElement, values: Record<string, number>) => {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(el, key, { configurable: true, value })
  }
}
const rect = (top: number, left = 0, right = 500, bottom = top) =>
  ({ top, left, right, bottom }) as DOMRect

// A chat scrolled to 2000, its top at 100 in the window, and a card at 700 spanning 0–500.
const revealIn = async (coverOf?: () => DOMRect | null): Promise<unknown> => {
  const scroller = document.createElement('div')
  const card = document.createElement('div')
  scroller.append(card)
  define(scroller, { scrollTop: 2000, clientHeight: 600, scrollHeight: 10_000 })
  define(card, { offsetHeight: 40 })
  scroller.getBoundingClientRect = () => rect(100)
  card.getBoundingClientRect = () => rect(700)
  const glideTo = vi.fn()
  const scope = effectScope()
  scope.run(() => useRevealTarget(ref(scroller), glideTo, coverOf))

  card.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true, detail: { block: 'start' } }))
  await nextTick()
  scope.stop()
  return glideTo.mock.calls[0]?.[0]
}

describe('useRevealTarget', () => {
  it('should glide the scrolled chat to the card measured from its content top', async () => {
    expect(await revealIn()).toBe(2584)
  })

  it('should land the card below an open search over it that ends at 160', async () => {
    expect(await revealIn(() => rect(108, 300, 700, 160))).toBe(2524)
  })

  it('should ignore an open search beside the card', async () => {
    expect(await revealIn(() => rect(108, 600, 1000, 160))).toBe(2584)
  })
})
