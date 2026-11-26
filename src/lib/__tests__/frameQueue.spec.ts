import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFrameQueue } from '../frameQueue'

describe('createFrameQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout']
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should hand over everything pushed in a frame together at the next frame', () => {
    const flush = vi.fn()
    const queue = createFrameQueue<number>(flush)
    queue.push(1)
    queue.push(2)
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersToNextFrame()
    expect(flush).toHaveBeenCalledExactlyOnceWith([1, 2])
  })

  it('should hand over what waits at once on drain', () => {
    const flush = vi.fn()
    const queue = createFrameQueue<string>(flush)
    queue.push('a')
    queue.drain()
    vi.advanceTimersToNextFrame()
    expect(flush).toHaveBeenCalledExactlyOnceWith(['a'])
  })

  it('should hand over after the fallback time when no frame comes', () => {
    const flush = vi.fn()
    const queue = createFrameQueue<number>(flush)
    queue.push(7)
    vi.advanceTimersByTime(100)
    expect(flush).toHaveBeenCalledWith([7])
  })

  it('should start a new batch after a hand-over', () => {
    const flush = vi.fn()
    const queue = createFrameQueue<number>(flush)
    queue.push(1)
    vi.advanceTimersToNextFrame()
    queue.push(2)
    vi.advanceTimersToNextFrame()
    expect(flush.mock.calls).toEqual([[[1]], [[2]]])
  })
})
