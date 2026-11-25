import { defineComponent, h, nextTick, reactive, useTemplateRef, type Ref } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  anchorCorrectionOf,
  isOlderPageLanding,
  shouldLoadOlder,
  useOlderHistory,
  type OlderHistoryState
} from '../useOlderHistory'

const ITEM_HEIGHT = 50
const PAGE = 40

enableAutoUnmount(afterEach)

const keysOf = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, index) => `m${from + index}`)

/** A transcript of `keys`, the oldest first, as the chat renders it into its scroller. */
const mountHistory = async (initial: OlderHistoryState & { keys: string[] }) => {
  const state = reactive({ ...initial })
  const load = vi.fn()
  const glide = { isGliding: false }
  let area: Ref<HTMLElement | null> | undefined
  const host = defineComponent({
    setup: () => {
      area = useTemplateRef<HTMLElement>('area')
      useOlderHistory(area, () => state, { load, isGliding: () => glide.isGliding })
      return () =>
        h(
          'div',
          { ref: 'area' },
          state.keys.map((key) => h('div', { key, 'data-search-key': key }))
        )
    }
  })
  mount(host, { attachTo: document.body })
  // The scroll listener binds once the rendered area reached the template ref.
  await nextTick()
  const scroller = area?.value
  if (!scroller) throw new Error('no scroller')
  layOut(scroller, () => state.keys.length)
  return { state, load, glide, scroller }
}

/**
 * jsdom lays nothing out: every item is one row of ITEM_HEIGHT, and the scroller's top is the
 * viewport's.
 */
const layOut = (scroller: HTMLElement, count: () => number) => {
  Object.defineProperty(scroller, 'scrollHeight', { get: () => count() * ITEM_HEIGHT })
  Object.defineProperty(scroller, 'scrollTop', { writable: true, value: 0 })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    if (this === scroller) return new DOMRect(0, 0, 0, 0)
    const index = [...scroller.children].indexOf(this)
    return new DOMRect(0, index * ITEM_HEIGHT - scroller.scrollTop, 0, ITEM_HEIGHT)
  })
}

const scrollTo = (scroller: HTMLElement, top: number) => {
  scroller.scrollTop = top
  scroller.dispatchEvent(new Event('scroll'))
}

// The anchor is restored a tick after the render that added the page.
const settle = async () => {
  await nextTick()
  await nextTick()
}

const loaded = { history: 'loaded', hasMore: true, count: PAGE } as const

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('shouldLoadOlder', () => {
  it('should load while the top is closer than the look-ahead', () => {
    expect(shouldLoadOlder(599, loaded)).toBe(true)
    expect(shouldLoadOlder(600, loaded)).toBe(false)
  })

  it('should not load a transcript that is loading, failed, complete or not read yet', () => {
    expect(shouldLoadOlder(0, { ...loaded, history: 'loading' })).toBe(false)
    expect(shouldLoadOlder(0, { ...loaded, history: 'failed' })).toBe(false)
    expect(shouldLoadOlder(0, { ...loaded, hasMore: false })).toBe(false)
    expect(shouldLoadOlder(0, { ...loaded, count: 0 })).toBe(false)
  })
})

describe('isOlderPageLanding', () => {
  it('should count a finished load above messages already shown', () => {
    expect(isOlderPageLanding({ history: 'loading', count: 40 }, { history: 'loaded' })).toBe(true)
    expect(isOlderPageLanding({ history: 'loading', count: 40 }, { history: 'failed' })).toBe(true)
  })

  it('should not count the first page or a load still running', () => {
    expect(isOlderPageLanding({ history: 'loading', count: 0 }, { history: 'loaded' })).toBe(false)
    expect(isOlderPageLanding({ history: 'loaded', count: 40 }, { history: 'loading' })).toBe(false)
  })
})

describe('anchorCorrectionOf', () => {
  it('should move by how far the anchor moved down', () => {
    expect(anchorCorrectionOf({ key: 'm6', offset: 20, scrollHeight: 2000 }, 2020, 4000)).toBe(2000)
  })

  it('should fall back to the grown height without an anchor', () => {
    expect(anchorCorrectionOf({ key: null, offset: 0, scrollHeight: 2000 }, null, 3500)).toBe(1500)
  })
})

describe('useOlderHistory', () => {
  it('should ask once when the reader scrolls near the top, not further down', async () => {
    const { load, scroller } = await mountHistory({ ...loaded, keys: keysOf(40, 80) })

    scrollTo(scroller, 700)
    scrollTo(scroller, 500)

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('should not ask while the list glides past the top on its way down', async () => {
    const { load, glide, scroller } = await mountHistory({ ...loaded, keys: keysOf(40, 80) })

    glide.isGliding = true
    scrollTo(scroller, 0)

    expect(load).toHaveBeenCalledTimes(0)
  })

  it('should keep the message in view where it was when the page lands above it', async () => {
    const { state, load, scroller } = await mountHistory({
      ...loaded,
      history: 'loading',
      keys: keysOf(40, 80)
    })
    scroller.scrollTop = 300

    Object.assign(state, { history: 'loaded', count: 80, keys: keysOf(0, 80) })
    await settle()

    // m46 sat at the top of the view; 40 rows of 50 px came in above it.
    expect(scroller.scrollTop).toBe(2300)
    expect(load).toHaveBeenCalledTimes(0)
  })

  it('should hold on to the last item above while the view lies inside it', async () => {
    const { state, scroller } = await mountHistory({
      ...loaded,
      history: 'loading',
      keys: keysOf(40, 80)
    })
    scroller.scrollTop = 3960

    Object.assign(state, { history: 'loaded', count: 80, keys: keysOf(0, 80) })
    await settle()

    expect(scroller.scrollTop).toBe(5960)
  })

  it('should ask for the next page when a short one leaves the top close', async () => {
    const { state, load, scroller } = await mountHistory({
      ...loaded,
      history: 'loading',
      keys: keysOf(40, 80)
    })
    scroller.scrollTop = 100

    Object.assign(state, { history: 'loaded', count: 42, keys: keysOf(38, 80) })
    await settle()

    expect(scroller.scrollTop).toBe(200)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('should not ask again after a page failed', async () => {
    const { state, load, scroller } = await mountHistory({
      ...loaded,
      history: 'loading',
      keys: keysOf(40, 80)
    })

    state.history = 'failed'
    await settle()
    scrollTo(scroller, 0)

    expect(scroller.scrollTop).toBe(0)
    expect(load).toHaveBeenCalledTimes(0)
  })
})
