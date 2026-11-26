import { defineComponent, h, nextTick, useTemplateRef } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScrollEdges } from '../useScrollEdges'

const VIEW_HEIGHT = 100

enableAutoUnmount(afterEach)
afterEach(() => vi.unstubAllGlobals())

/** jsdom has no resize observer: like a browser's, this one reports each element it starts observing. */
class ReportingResizeObserver {
  readonly callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe() {
    queueMicrotask(() => this.callback([], this as unknown as ResizeObserver))
  }
  unobserve() {}
  disconnect() {}
}

const mountEdges = async () => {
  let edges: ReturnType<typeof useScrollEdges> | undefined
  const host = defineComponent({
    setup: () => {
      const area = useTemplateRef<HTMLElement>('area')
      edges = useScrollEdges(area)
      return () => h('div', { ref: 'area' })
    }
  })
  const wrapper = mount(host, { attachTo: document.body })
  if (!edges) throw new Error('no scroll edges')
  // The scroll listener binds once the rendered area reached the template ref.
  await nextTick()
  return { edges, area: wrapper.element as HTMLElement }
}

/** jsdom lays nothing out: the area gets the scroll metrics a browser would measure. */
const layOut = (area: HTMLElement, contentHeight: number, scrollTop: number) => {
  Object.defineProperty(area, 'clientHeight', { configurable: true, value: VIEW_HEIGHT })
  Object.defineProperty(area, 'scrollHeight', { configurable: true, value: contentHeight })
  Object.defineProperty(area, 'scrollTop', { configurable: true, writable: true, value: scrollTop })
}

const scrollTo = async (area: HTMLElement, contentHeight: number, scrollTop: number) => {
  layOut(area, contentHeight, scrollTop)
  area.dispatchEvent(new Event('scroll'))
  await nextTick()
}

const edgesOf = ({ hasMoreAbove, hasMoreBelow }: ReturnType<typeof useScrollEdges>) => ({
  above: hasMoreAbove.value,
  below: hasMoreBelow.value
})

describe('useScrollEdges', () => {
  it('should show more below only while a long list rests at its start', async () => {
    const { edges, area } = await mountEdges()

    await scrollTo(area, 500, 0)

    expect(edgesOf(edges)).toEqual({ above: false, below: true })
  })

  it('should show more on both sides in the middle of a long list', async () => {
    const { edges, area } = await mountEdges()

    await scrollTo(area, 500, 200)

    expect(edgesOf(edges)).toEqual({ above: true, below: true })
  })

  it('should show more above only at the end of a long list', async () => {
    const { edges, area } = await mountEdges()

    await scrollTo(area, 500, 400)

    expect(edgesOf(edges)).toEqual({ above: true, below: false })
  })

  it('should show nothing when the content fits the area', async () => {
    const { edges, area } = await mountEdges()

    await scrollTo(area, 80, 0)

    expect(edgesOf(edges)).toEqual({ above: false, below: false })
  })

  it('should measure again when content arrives without a scroll', async () => {
    vi.stubGlobal('ResizeObserver', ReportingResizeObserver)
    const { edges, area } = await mountEdges()
    await scrollTo(area, 80, 0)

    layOut(area, 500, 0)
    area.append(document.createElement('p'))
    await new Promise((resolve) => setTimeout(resolve))

    expect(edgesOf(edges)).toEqual({ above: false, below: true })
  })
})
