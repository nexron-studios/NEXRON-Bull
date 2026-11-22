import { describe, expect, it } from 'vitest'
import { nearestScrollOf } from '../nearestScroll'

const view = { viewStart: 100, viewEnd: 400 }

describe('nearestScrollOf', () => {
  it('should keep the scroll position for an item already in view', () => {
    expect(nearestScrollOf({ ...view, itemStart: 150, itemEnd: 200 }, 500)).toBe(500)
  })

  it('should scroll back until an item before the view starts at its edge', () => {
    expect(nearestScrollOf({ ...view, itemStart: 60, itemEnd: 110 }, 500)).toBe(460)
  })

  it('should scroll on until an item after the view ends at its edge', () => {
    expect(nearestScrollOf({ ...view, itemStart: 380, itemEnd: 430 }, 500)).toBe(530)
  })

  it('should keep the scroll position for an item that already fills the view', () => {
    expect(nearestScrollOf({ ...view, itemStart: 50, itemEnd: 900 }, 500)).toBe(500)
  })

  it('should keep the start of an item larger than the view in view', () => {
    expect(nearestScrollOf({ ...view, itemStart: 300, itemEnd: 800 }, 500)).toBe(700)
  })
})
