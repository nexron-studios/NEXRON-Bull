import { effectScope, nextTick, ref, type MaybeRefOrGetter } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreviewStore } from '@/stores/preview'
import { useChatColumns } from '../useChatColumns'

const SIDEBAR_WIDTH = 320
const NARROW_WINDOW = 900
const WIDE_WINDOW = 1800

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

const columns = (windowWidth: MaybeRefOrGetter<number> = WIDE_WINDOW) => {
  const scope = effectScope()
  const result = scope.run(() => useChatColumns(windowWidth, SIDEBAR_WIDTH, true))
  if (!result) throw new Error('useChatColumns returned nothing')
  return result
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition')
  localStorage.clear()
})

describe('useChatColumns', () => {
  it('should keep the panel open after two toggles in one frame', async () => {
    const transition = stubViewTransition()
    const { panel } = columns()

    void panel.toggle()
    void panel.toggle()
    await transition.takeSnapshot()

    expect(panel.isOpen.value).toBe(true)
  })

  it('should keep a panel toggle that a resize follows in the same frame', async () => {
    const transition = stubViewTransition()
    const { panel } = columns()

    void panel.toggle()
    void panel.resize({ isOpen: true, width: 320 })
    await transition.takeSnapshot()

    expect([panel.isOpen.value, panel.layout.value.width]).toEqual([false, 320])
  })

  it('should open the sheet where no column fits and keep the pane once the window widens', async () => {
    const windowWidth = ref(NARROW_WINDOW)
    const { preview } = columns(windowWidth)

    await preview.toggle()
    const narrow = preview.shownAs.value
    windowWidth.value = WIDE_WINDOW
    await nextTick()

    expect([narrow, preview.shownAs.value]).toEqual(['sheet', 'pane'])
  })

  it('should forget the sheet once it is closed', async () => {
    const { preview } = columns(NARROW_WINDOW)

    await preview.toggle()
    usePreviewStore().closeSheet()

    expect(preview.shownAs.value).toBe('none')
  })
})
