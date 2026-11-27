import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_TRANSITION_ATTRIBUTE } from '@/utils/viewTransitions'
import { LAYOUT_GLIDE_ATTRIBUTE, glideLayout } from '../layoutGlide'

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

describe('glideLayout', () => {
  it('should apply the update with the root marked as gliding', () => {
    let isMarkedDuringUpdate = false

    void glideLayout(() => {
      isMarkedDuringUpdate = document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)
    }, true)

    expect(isMarkedDuringUpdate).toBe(true)
  })

  it('should unmark the root once the spring has arrived', () => {
    void glideLayout(() => {}, true)
    vi.advanceTimersByTime(GLIDE_MS - 1)
    const isMarkedBefore = document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)
    vi.advanceTimersByTime(1)

    expect([isMarkedBefore, document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)]).toEqual(
      [true, false]
    )
  })

  it('should keep the root marked for a glide that starts while another runs', () => {
    void glideLayout(() => {}, true)
    vi.advanceTimersByTime(GLIDE_MS - 10)
    void glideLayout(() => {}, true)
    vi.advanceTimersByTime(10)

    expect(document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)).toBe(true)
  })

  it('should apply a change within the same layout without gliding', () => {
    const applied: string[] = []

    void glideLayout(() => applied.push('width'), false)

    expect([applied, document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)]).toEqual([
      ['width'],
      false
    ])
  })

  it('should not glide during a page change, which shows snapshots', () => {
    document.documentElement.setAttribute(ROUTE_TRANSITION_ATTRIBUTE, 'next')
    let isMarkedDuringUpdate = true

    void glideLayout(() => {
      isMarkedDuringUpdate = document.documentElement.hasAttribute(LAYOUT_GLIDE_ATTRIBUTE)
    }, true)

    expect(isMarkedDuringUpdate).toBe(false)
  })
})
