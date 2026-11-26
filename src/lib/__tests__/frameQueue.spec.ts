import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFrameQueue } from '../frameQueue'

const { handleError } = vi.hoisted(() => ({ handleError: vi.fn() }))
vi.mock('@/lib/error', () => ({ handleError }))

describe('createFrameQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout']
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    handleError.mockReset()
  })

  it('should apply everything pushed in a frame at the next frame, in order', () => {
    const apply = vi.fn()
    const queue = createFrameQueue<number>(apply)
    queue.push(1)
    queue.push(2)
    const callsBefore = apply.mock.calls.length
    vi.advanceTimersToNextFrame()
    expect([callsBefore, apply.mock.calls]).toEqual([0, [[1], [2]]])
  })

  it('should apply what waits at once on drain', () => {
    const apply = vi.fn()
    const queue = createFrameQueue<string>(apply)
    queue.push('a')
    queue.drain()
    vi.advanceTimersToNextFrame()
    expect(apply.mock.calls).toEqual([['a']])
  })

  it('should apply after the fallback time when no frame comes', () => {
    // A window in the background: its frames never come.
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    const apply = vi.fn()
    const queue = createFrameQueue<number>(apply)
    queue.push(7)
    vi.advanceTimersByTime(99)
    const isAppliedEarly = apply.mock.calls.length > 0
    vi.advanceTimersByTime(1)
    expect([isAppliedEarly, apply.mock.calls]).toEqual([false, [[7]]])
  })

  it('should start a new batch after a hand-over', () => {
    const apply = vi.fn()
    const queue = createFrameQueue<number>(apply)
    queue.push(1)
    vi.advanceTimersToNextFrame()
    queue.push(2)
    vi.advanceTimersToNextFrame()
    expect(apply.mock.calls).toEqual([[1], [2]])
  })

  it('should report an item that fails and still apply the ones after it', () => {
    const failure = new Error('broken token')
    const applied: number[] = []
    const queue = createFrameQueue<number>((item) => {
      if (item === 1) throw failure
      applied.push(item)
    })
    queue.push(1)
    queue.push(2)
    queue.drain()
    expect([applied, handleError.mock.calls]).toEqual([[2], [[failure]]])
  })
})
