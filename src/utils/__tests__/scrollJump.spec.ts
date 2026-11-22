import { describe, expect, it } from 'vitest'
import { smoothScrollStartOf } from '../scrollJump'

describe('smoothScrollStartOf', () => {
  it('should glide from where the reader is when the end is close', () => {
    expect(smoothScrollStartOf(1000, 2400, 800)).toBe(1000)
  })

  it('should skip to one and a half screens above the end when it is far away', () => {
    expect(smoothScrollStartOf(0, 10800, 800)).toBe(8800)
  })

  it('should still glide from where the reader is at exactly one and a half screens', () => {
    expect(smoothScrollStartOf(800, 2800, 800)).toBe(800)
  })

  it('should stay put when the reader is already at the end', () => {
    expect(smoothScrollStartOf(2000, 2800, 800)).toBe(2000)
  })
})
