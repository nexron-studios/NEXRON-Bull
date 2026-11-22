import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReadyGate } from '../terminalReady'

describe('createReadyGate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should fire once the output went quiet', () => {
    const onReady = vi.fn()
    const gate = createReadyGate(onReady, 300, 5000)
    gate.output()
    vi.advanceTimersByTime(200)
    gate.output()
    vi.advanceTimersByTime(299)
    expect(onReady.mock.calls.length).toBe(0)
    vi.advanceTimersByTime(1)
    expect(onReady.mock.calls.length).toBe(1)
  })

  it('should fire at the latest after the maximum wait, and only once', () => {
    const onReady = vi.fn()
    const gate = createReadyGate(onReady, 300, 1000)
    for (let elapsed = 0; elapsed < 1200; elapsed += 100) {
      gate.output()
      vi.advanceTimersByTime(100)
    }
    vi.advanceTimersByTime(1000)
    expect(onReady.mock.calls.length).toBe(1)
  })

  it('should not fire after the shell went away', () => {
    const onReady = vi.fn()
    const gate = createReadyGate(onReady, 300, 1000)
    gate.output()
    gate.cancel()
    vi.advanceTimersByTime(2000)
    expect(onReady.mock.calls.length).toBe(0)
  })
})
