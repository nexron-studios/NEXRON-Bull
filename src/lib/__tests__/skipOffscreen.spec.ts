import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, withDirectives } from 'vue'
import { pauseSkipping, rearmSkipping, vSkipOffscreen } from '../skipOffscreen'

const Host = defineComponent({
  setup: () => () => withDirectives(h('div', 'Message'), [[vSkipOffscreen]])
})

describe('vSkipOffscreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should let the browser skip the element only after its first layout', () => {
    const el = mount(Host).element as HTMLElement
    const before = el.style.contentVisibility
    vi.advanceTimersToNextFrame()
    const afterOneFrame = el.style.contentVisibility
    vi.advanceTimersToNextFrame()
    expect([before, afterOneFrame, el.style.contentVisibility]).toEqual(['', '', 'auto'])
  })

  it('should keep the size the element was laid out with while it is skipped', () => {
    const el = mount(Host).element as HTMLElement
    expect(el.style.containIntrinsicSize).toBe('auto none')
  })

  it('should lay a skipped element out again before letting it be skipped once more', () => {
    const wrapper = mount(Host, { attachTo: document.body })
    const el = wrapper.element as HTMLElement
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    pauseSkipping(document.body)
    const paused = el.style.contentVisibility
    rearmSkipping(document.body)
    const rearmedAtOnce = el.style.contentVisibility
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    expect([paused, rearmedAtOnce, el.style.contentVisibility]).toEqual(['', '', 'auto'])
    wrapper.unmount()
  })
})
