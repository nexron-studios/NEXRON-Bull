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
    vi.unstubAllGlobals()
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
    // A window in the background: its frames never come.
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    const flush = vi.fn()
    const queue = createFrameQueue<number>(flush)
    queue.push(7)
    vi.advanceTimersByTime(99)
    const isFlushedEarly = flush.mock.calls.length > 0
    vi.advanceTimersByTime(1)
    expect([isFlushedEarly, flush.mock.calls]).toEqual([false, [[[7]]]])
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
