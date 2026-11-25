import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPane from '../ChatPane.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import i18n from '@/i18n'
import { newTab } from '@/utils/chatTab'

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: { send: vi.fn(), ask: vi.fn(), waitFor: vi.fn(), onEvent: () => () => {} }
}))

const VIEW_HEIGHT = 600

const tab = {
  ...newTab({
    id: 't1',
    title: 'Chat',
    profile: null,
    account: 'work',
    cwd: 'C:\\work\\app',
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  status: 'idle' as const,
  history: 'loaded' as const
}

/** jsdom does not lay out or scroll: the scroller gets a fixed height and records its scrolls. */
const fakeScroller = (el: HTMLElement, contentHeight: number) => {
  const box = { top: 0, height: contentHeight }
  const scrolls: ScrollToOptions[] = []
  Object.defineProperty(el, 'clientHeight', { get: () => VIEW_HEIGHT })
  Object.defineProperty(el, 'scrollHeight', { get: () => box.height })
  Object.defineProperty(el, 'scrollTop', {
    get: () => box.top,
    set: (top: number) => (box.top = top)
  })
  // A smooth scroll only starts here; the test says when it arrives.
  el.scrollTo = ((options: ScrollToOptions) => {
    scrolls.push(options)
    if (options.behavior !== 'smooth')
      box.top = Math.min(options.top ?? 0, box.height - VIEW_HEIGHT)
  }) as HTMLElement['scrollTo']
  const scrollTo = (top: number, event: 'scroll' | 'scrollend') => {
    box.top = top
    el.dispatchEvent(new Event(event))
  }
  return { box, scrolls, scrollTo }
}

// Long enough for the follow's spring to come to rest.
const FOLLOW_SETTLE_MS = 1_000

describe('ChatPane', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should jump near the end and glide the rest on the button, following Claude', async () => {
    const wrapper = shallowMount(ChatPane, {
      props: { tab },
      global: {
        plugins: [i18n, createPinia(), [VueQueryPlugin, { queryClient: new QueryClient() }]]
      }
    })
    const scroller = fakeScroller(wrapper.find('.overflow-y-auto').element as HTMLElement, 10_000)
    await flushPromises()
    scroller.scrollTo(0, 'scroll')
    await flushPromises()
    scroller.scrolls.length = 0

    wrapper.findComponent(NchIconButton).vm.$emit('click')
    // 1.5 screens above the end: 10 000 − 600 − 900.
    const jumpedTo = scroller.box.top
    vi.advanceTimersByTime(16)
    const firstFrame = scroller.box.top
    scroller.box.height = 10_300
    await wrapper.setProps({
      tab: { ...tab, live: { kind: 'writing', text: 'Noch ein Absatz' } }
    })
    await flushPromises()
    vi.advanceTimersByTime(FOLLOW_SETTLE_MS)

    expect(jumpedTo).toBe(8_500)
    expect(firstFrame).toBeGreaterThan(8_500)
    expect(firstFrame).toBeLessThan(8_600)
    expect(scroller.scrolls).toEqual([])
    expect(scroller.box.top).toBe(9_700)
  })

  it('should stop the button glide where the reader scrolls up', async () => {
    const wrapper = shallowMount(ChatPane, {
      props: { tab },
      global: {
        plugins: [i18n, createPinia(), [VueQueryPlugin, { queryClient: new QueryClient() }]]
      }
    })
    const scroller = fakeScroller(wrapper.find('.overflow-y-auto').element as HTMLElement, 10_000)
    await flushPromises()
    scroller.scrollTo(0, 'scroll')
    await flushPromises()

    wrapper.findComponent(NchIconButton).vm.$emit('click')
    vi.advanceTimersByTime(48)
    scroller.scrollTo(8_600, 'scroll')
    await wrapper.setProps({
      tab: { ...tab, live: { kind: 'writing', text: 'Fertig.' } }
    })
    await flushPromises()
    vi.advanceTimersByTime(FOLLOW_SETTLE_MS)

    expect(scroller.box.top).toBe(8_600)
  })

  it('should glide after a growing reply instead of jumping to its end', async () => {
    const wrapper = shallowMount(ChatPane, {
      props: { tab },
      global: {
        plugins: [i18n, createPinia(), [VueQueryPlugin, { queryClient: new QueryClient() }]]
      }
    })
    const scroller = fakeScroller(wrapper.find('.overflow-y-auto').element as HTMLElement, 10_000)
    await flushPromises()
    scroller.scrollTo(9_400, 'scroll')

    scroller.box.height = 10_100
    await wrapper.setProps({
      tab: { ...tab, live: { kind: 'writing', text: 'Eine neue Zeile' } }
    })
    await flushPromises()
    vi.advanceTimersByTime(16)
    const firstFrame = scroller.box.top
    vi.advanceTimersByTime(FOLLOW_SETTLE_MS)

    expect(firstFrame).toBeGreaterThan(9_400)
    expect(firstFrame).toBeLessThan(9_420)
    expect(scroller.box.top).toBe(9_500)
  })

  it('should let go of a follow when the reader scrolls up', async () => {
    const wrapper = shallowMount(ChatPane, {
      props: { tab },
      global: {
        plugins: [i18n, createPinia(), [VueQueryPlugin, { queryClient: new QueryClient() }]]
      }
    })
    const scroller = fakeScroller(wrapper.find('.overflow-y-auto').element as HTMLElement, 10_000)
    await flushPromises()
    scroller.scrollTo(9_400, 'scroll')

    scroller.box.height = 11_000
    await wrapper.setProps({
      tab: { ...tab, live: { kind: 'writing', text: 'Ein langer Codeblock' } }
    })
    await flushPromises()
    vi.advanceTimersByTime(48)
    scroller.scrollTo(5_000, 'scroll')
    vi.advanceTimersByTime(FOLLOW_SETTLE_MS)

    expect(scroller.box.top).toBe(5_000)
  })

  it('should glide through a burst of growth without jumping by it', async () => {
    const wrapper = shallowMount(ChatPane, {
      props: { tab },
      global: {
        plugins: [i18n, createPinia(), [VueQueryPlugin, { queryClient: new QueryClient() }]]
      }
    })
    const scroller = fakeScroller(wrapper.find('.overflow-y-auto').element as HTMLElement, 10_000)
    await flushPromises()
    scroller.scrollTo(9_400, 'scroll')

    // Five chunks of 100 px, one every 50 ms, while the follow from the first is still running.
    const moves: number[] = []
    for (let chunk = 1; chunk <= 5; chunk++) {
      scroller.box.height = 10_000 + chunk * 100
      await wrapper.setProps({
        tab: { ...tab, live: { kind: 'writing', text: 'Zeile '.repeat(chunk) } }
      })
      await flushPromises()
      for (let frame = 0; frame < 3; frame++) {
        const before = scroller.box.top
        vi.advanceTimersByTime(16)
        moves.push(scroller.box.top - before)
      }
    }
    vi.advanceTimersByTime(FOLLOW_SETTLE_MS)

    expect(Math.max(...moves)).toBeLessThan(40)
    expect(moves.every((move) => move >= 0)).toBe(true)
    expect(scroller.box.top).toBe(9_900)
  })

  it('should let go when the reader scrolls up by a single pixel', async () => {
    const wrapper = shallowMount(ChatPane, {
      props: { tab },
      global: {
        plugins: [i18n, createPinia(), [VueQueryPlugin, { queryClient: new QueryClient() }]]
      }
    })
    const scroller = fakeScroller(wrapper.find('.overflow-y-auto').element as HTMLElement, 10_000)
    await flushPromises()
    scroller.scrollTo(9_400, 'scroll')

    scroller.box.height = 10_400
    await wrapper.setProps({
      tab: { ...tab, live: { kind: 'writing', text: 'Ein Absatz' } }
    })
    await flushPromises()
    vi.advanceTimersByTime(32)
    // A touchpad creeping up: the move stays inside the old 2 px slack.
    const readerAt = scroller.box.top - 1
    scroller.box.top = readerAt
    vi.advanceTimersByTime(FOLLOW_SETTLE_MS)

    expect(scroller.box.top).toBe(readerAt)
  })
})
