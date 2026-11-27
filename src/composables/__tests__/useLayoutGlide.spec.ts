import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_TRANSITION_ATTRIBUTE } from '@/utils/viewTransitions'
import { LAYOUT_GLIDE_ATTRIBUTE, useLayoutGlide } from '../useLayoutGlide'

const GLIDE_MS = 410

beforeEach(() => {
  vi.useFakeTimers()
  document.documentElement.style.setProperty('--duration-spring-smooth', `${GLIDE_MS}ms`)
})

afterEach(() => {
  vi.runAllTimers()
  vi.useRealTimers()
  document.documentElement.style.removeProperty('--duration-spring-smooth')
  document.documentElement.removeAttribute(ROUTE_TRANSITION_ATTRIBUTE)
})

describe('useLayoutGlide', () => {
  it('should apply the update with the root marked as gliding', () => {
    const { glide } = useLayoutGlide()
    let isMarkedDuringUpdate = false

    void glide(() => {
      isMarkedDuringUpdate = document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)
    }, true)

    expect(isMarkedDuringUpdate).toBe(true)
  })

  it('should unmark the root once the spring has arrived', () => {
    const { glide } = useLayoutGlide()

    void glide(() => {}, true)
    vi.advanceTimersByTime(GLIDE_MS - 1)
    const isMarkedBefore = document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)
    vi.advanceTimersByTime(1)

    expect([isMarkedBefore, document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)]).toEqual(
      [true, false]
    )
  })

  it('should keep the root marked for a glide that starts while another runs', () => {
    const { glide } = useLayoutGlide()

    void glide(() => {}, true)
    vi.advanceTimersByTime(GLIDE_MS - 10)
    void glide(() => {}, true)
    vi.advanceTimersByTime(10)

    expect(document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)).toBe(true)
  })

  it('should apply a change within the same layout without gliding', () => {
    const { glide } = useLayoutGlide()
    const applied: string[] = []

    void glide(() => applied.push('width'), false)

    expect([applied, document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)]).toEqual([
      ['width'],
      false
    ])
  })

  it('should not glide during a page change, which shows snapshots', () => {
    document.documentElement.setAttribute(ROUTE_TRANSITION_ATTRIBUTE, 'next')
    const { glide } = useLayoutGlide()
    let isMarkedDuringUpdate = true

    void glide(() => {
      isMarkedDuringUpdate = document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)
    }, true)

    expect(isMarkedDuringUpdate).toBe(false)
  })
})
