import { describe, expect, it } from 'vitest'
import { isScrollbarHit } from '../scrollbarHit'

const scroller = { clientWidth: 800, clientHeight: 600, scrollWidth: 800, scrollHeight: 4000 }

describe('isScrollbarHit', () => {
  it('should be a scrollbar hit right of the client box of a scrolling element', () => {
    expect(isScrollbarHit(805, 300, scroller)).toBe(true)
  })

  it('should not be a scrollbar hit inside the client box', () => {
    expect(isScrollbarHit(400, 300, scroller)).toBe(false)
  })

  it('should not be a scrollbar hit on an inline element with an empty client box', () => {
    const span = { clientWidth: 0, clientHeight: 0, scrollWidth: 0, scrollHeight: 0 }
    expect(isScrollbarHit(12, 4, span)).toBe(false)
  })
})
