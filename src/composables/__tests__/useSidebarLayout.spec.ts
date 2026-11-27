import { effectScope, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LAYOUT_GLIDE_ATTRIBUTE } from '@/lib/layoutGlide'
import { useSidebarLayout } from '../useSidebarLayout'

let scope: EffectScope

const sidebar = () => {
  scope = effectScope()
  const result = scope.run(useSidebarLayout)
  if (!result) throw new Error('useSidebarLayout returned nothing')
  return result
}

/** jsdom has no View Transitions: this one applies the update at once. */
const stubViewTransition = () => {
  const start = vi.fn((update: () => Promise<void>) => {
    const updateCallbackDone = update()
    return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone }
  })
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
  return start
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  scope.stop()
  vi.runAllTimers()
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'startViewTransition')
  localStorage.clear()
})

describe('useSidebarLayout', () => {
  it('should glide from panel to rail instead of morphing snapshots', async () => {
    const start = stubViewTransition()
    const { layout, toggleRail } = sidebar()

    await toggleRail()

    expect([
      layout.value,
      document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE),
      start.mock.calls.length
    ]).toEqual(['rail', true, 0])
  })

  it('should morph to full width, where the chat leaves', () => {
    const start = stubViewTransition()
    const { resize } = sidebar()

    void resize({ layout: 'full', width: 320 })

    expect([
      start.mock.calls.length,
      document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)
    ]).toEqual([1, false])
  })
})
