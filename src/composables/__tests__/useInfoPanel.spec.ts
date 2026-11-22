import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useInfoPanel } from '../useInfoPanel'

// A window with room for the panel beside a 300 px sidebar.
const WINDOW_WIDTH = 1600
const SIDEBAR_WIDTH = 300

/** jsdom has no View Transitions: the update runs when the test takes the snapshot. */
const stubViewTransition = () => {
  let update = async () => {}
  const start = vi.fn((callback: () => Promise<void>) => {
    update = callback
    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      updateCallbackDone: Promise.resolve()
    }
  })
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
  return { takeSnapshot: () => update() }
}

const panel = () => {
  const scope = effectScope()
  const result = scope.run(() => useInfoPanel(WINDOW_WIDTH, SIDEBAR_WIDTH, true))
  if (!result) throw new Error('useInfoPanel returned nothing')
  return result
}

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition')
  localStorage.clear()
})

describe('useInfoPanel', () => {
  it('should stay open after two toggles in one frame', async () => {
    const transition = stubViewTransition()
    const { isOpen, toggle } = panel()

    void toggle()
    void toggle()
    await transition.takeSnapshot()

    expect(isOpen.value).toBe(true)
  })

  it('should keep a toggle that a resize follows in the same frame', async () => {
    const transition = stubViewTransition()
    const { isOpen, width, toggle, resize } = panel()

    void toggle()
    void resize({ isOpen: true, width: 320 })
    await transition.takeSnapshot()

    expect({ isOpen: isOpen.value, width: width.value }).toEqual({ isOpen: false, width: 320 })
  })
})
