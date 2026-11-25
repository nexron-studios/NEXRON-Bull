import { defineComponent, h, nextTick, reactive, useTemplateRef, type Ref } from 'vue'
import { createEventHook } from '@vueuse/core'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  anchorCorrectionOf,
  landingOf,
  SCROLL_ANCHOR_ATTRIBUTE,
  shouldLoadOlder,
  useOlderHistory,
  type OlderHistoryState
} from '../useOlderHistory'

const ITEM_HEIGHT = 50
const PAGE = 40

enableAutoUnmount(afterEach)

const keysOf = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, index) => `m${from + index}`)

interface HistoryFixture extends OlderHistoryState {
  keys: string[]
  /** Items from this index on keep their key when a page lands: the first turn */
  anchorsFrom: number
}

/** A transcript of `keys`, the oldest first, as the chat renders it into its scroller. */
const mountHistory = async (initial: Partial<HistoryFixture> = {}) => {
  const state = reactive<HistoryFixture>({
    ...loaded,
    keys: keysOf(40, 80),
    anchorsFrom: 0,
    ...initial
  })
  const load = vi.fn()
  const glide = { isGliding: false }
  const glideEnd = createEventHook<void>()
  let area: Ref<HTMLElement | null> | undefined
  const host = defineComponent({
    setup: () => {
      area = useTemplateRef<HTMLElement>('area')
      useOlderHistory(area, () => state, {
        load,
        isGliding: () => glide.isGliding,
        onGlideEnd: glideEnd.on
      })
      return () =>
        h(
          'div',
          { ref: 'area' },
          state.keys.map((key, index) =>
            h('div', { key, [SCROLL_ANCHOR_ATTRIBUTE]: index >= state.anchorsFrom ? key : null })
          )
        )
    }
  })
  mount(host, { attachTo: document.body })
  // The scroll listener binds once the rendered area reached the template ref.
  await nextTick()
  const scroller = area?.value
  if (!scroller) throw new Error('no scroller')
  layOut(scroller, () => state.keys.length)
  return { state, load, glide, glideEnd, scroller }
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

// The check after a first page runs a frame later; frames run in the order they were asked for.
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** jsdom has no ResizeObserver: this one reports a resize when the test says so. */
const resizes: (() => void)[] = []
class FakeResizeObserver {
  constructor(callback: () => void) {
    resizes.push(callback)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
const resize = () => resizes.at(-1)?.()

const loaded = { history: 'loaded', hasMore: true, count: PAGE } as const

beforeEach(() => {
  vi.restoreAllMocks()
  resizes.length = 0
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
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

describe('landingOf', () => {
  it('should tell an older page above shown messages from the first page', () => {
    expect(landingOf({ history: 'loading', count: 40 }, { history: 'loaded' })).toBe('older')
    expect(landingOf({ history: 'loading', count: 40 }, { history: 'failed' })).toBe('older')
    expect(landingOf({ history: 'loading', count: 0 }, { history: 'loaded' })).toBe('first')
  })

  it('should not count a load that starts', () => {
    expect(landingOf({ history: 'loaded', count: 40 }, { history: 'loading' })).toBe('none')
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
    const { load, scroller } = await mountHistory()

    scrollTo(scroller, 700)
    scrollTo(scroller, 500)

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('should wait for a glide past the top to come to rest, then check where it ended', async () => {
    const { load, glide, glideEnd, scroller } = await mountHistory()

    glide.isGliding = true
    scrollTo(scroller, 0)
    glide.isGliding = false
    await glideEnd.trigger()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('should ask for the second page when the first one does not fill the view', async () => {
    const { state, load } = await mountHistory({ history: 'loading', count: 0, keys: [] })

    Object.assign(state, { history: 'loaded', count: 3, keys: keysOf(77, 80) })
    await nextTick()
    await nextFrame()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('should keep the message in view where it was when the page lands above it', async () => {
    const { state, load, scroller } = await mountHistory({ history: 'loading' })
    scroller.scrollTop = 300

    Object.assign(state, { history: 'loaded', count: 80, keys: keysOf(0, 80) })
    await settle()

    // m46 sat at the top of the view; 40 rows of 50 px came in above it.
    expect(scroller.scrollTop).toBe(2300)
    expect(load).toHaveBeenCalledTimes(0)
  })

  it('should anchor on the first turn, past items the page folds away, while a reply grows', async () => {
    // m40–m49 are the run before the first turn; the view starts inside it.
    const { state, scroller } = await mountHistory({ history: 'loading', anchorsFrom: 10 })
    scroller.scrollTop = 100

    // The new page joins that run and folds it into one line, and a reply arrives below.
    Object.assign(state, {
      history: 'loaded',
      count: 85,
      keys: [...keysOf(0, 30), 'reads:m30', ...keysOf(50, 85)],
      anchorsFrom: 5
    })
    await settle()

    // m50 sat 400 px below the top, now 1450: the grown height (1300) would be wrong.
    expect(scroller.scrollTop).toBe(1150)
  })

  it('should hold on to the last item above while the view lies inside it', async () => {
    const { state, scroller } = await mountHistory({ history: 'loading' })
    scroller.scrollTop = 3960

    Object.assign(state, { history: 'loaded', count: 80, keys: keysOf(0, 80) })
    await settle()

    expect(scroller.scrollTop).toBe(5960)
  })

  it('should take out growth above, anchored on what the reader scrolled to', async () => {
    const { state, scroller } = await mountHistory({ history: 'loading' })
    scroller.scrollTop = 300
    Object.assign(state, { history: 'loaded', count: 80, keys: keysOf(0, 80) })
    await settle()

    // An image in the new page finished loading: one row more above the anchor.
    state.keys = ['image', ...state.keys]
    await nextTick()
    resize()
    // The reader scrolls up to m10 (offset 0); the next image grows above that one.
    scrollTo(scroller, 550)
    state.keys = ['image2', ...state.keys]
    await nextTick()
    resize()

    expect(scroller.scrollTop).toBe(600)
  })

  it('should not take its own correction, arriving late, for the reader', async () => {
    const { state, scroller } = await mountHistory({ history: 'loading' })
    scroller.scrollTop = 300
    Object.assign(state, { history: 'loaded', count: 80, keys: keysOf(0, 80) })
    await settle()
    state.keys = ['image', ...state.keys]
    await nextTick()
    resize()

    // The next image grew before the scroll event of that correction (2350) came in.
    state.keys = ['image2', ...state.keys]
    await nextTick()
    scroller.dispatchEvent(new Event('scroll'))
    resize()

    expect(scroller.scrollTop).toBe(2400)
  })

  it('should let go of the anchor once the hold is over', async () => {
    vi.useFakeTimers()
    const { state, scroller } = await mountHistory({ history: 'loading' })
    scroller.scrollTop = 300
    Object.assign(state, { history: 'loaded', count: 80, keys: keysOf(0, 80) })
    await settle()

    vi.advanceTimersByTime(5000)
    state.keys = ['image', ...state.keys]
    await nextTick()
    resize()
    vi.useRealTimers()

    expect(scroller.scrollTop).toBe(2300)
  })

  it('should ask for the next page when a short one leaves the top close', async () => {
    const { state, load, scroller } = await mountHistory({ history: 'loading' })
    scroller.scrollTop = 100

    Object.assign(state, { history: 'loaded', count: 42, keys: keysOf(38, 80) })
    await settle()

    expect(scroller.scrollTop).toBe(200)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('should not ask again after a page failed', async () => {
    const { state, load, scroller } = await mountHistory({ history: 'loading' })

    state.history = 'failed'
    await settle()
    scrollTo(scroller, 0)

    expect(scroller.scrollTop).toBe(0)
    expect(load).toHaveBeenCalledTimes(0)
  })
})
