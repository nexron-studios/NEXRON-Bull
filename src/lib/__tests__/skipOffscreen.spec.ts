import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, withDirectives } from 'vue'
import { vSkipOffscreen } from '../skipOffscreen'

const Host = defineComponent({
  setup: () => () => withDirectives(h('div', 'Nachricht'), [[vSkipOffscreen]])
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
})
