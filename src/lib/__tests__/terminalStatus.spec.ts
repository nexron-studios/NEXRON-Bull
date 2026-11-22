import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTerminalStatus } from '../terminalStatus'

describe('createTerminalStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should start in the starting state', () => {
    const { status } = createTerminalStatus(3000)
    expect(status.value).toEqual({ kind: 'starting' })
  })

  it('should be ready once the shell drew something', () => {
    const terminal = createTerminalStatus(3000)
    terminal.spawned()
    terminal.reveal()
    expect(terminal.status.value).toEqual({ kind: 'ready' })
  })

  it('should reveal a silent shell after the wait, counted from the spawn', () => {
    const terminal = createTerminalStatus(3000)
    vi.advanceTimersByTime(5000)
    expect(terminal.status.value).toEqual({ kind: 'starting' })
    terminal.spawned()
    vi.advanceTimersByTime(2999)
    expect(terminal.status.value).toEqual({ kind: 'starting' })
    vi.advanceTimersByTime(1)
    expect(terminal.status.value).toEqual({ kind: 'ready' })
  })

  it('should keep the failure message instead of revealing', () => {
    const terminal = createTerminalStatus(3000)
    terminal.fail('pwsh.exe not found')
    terminal.reveal()
    expect(terminal.status.value).toEqual({ kind: 'failed', message: 'pwsh.exe not found' })
  })

  it('should show the skeleton again on a restart and drop the old wait', () => {
    const terminal = createTerminalStatus(3000)
    terminal.spawned()
    vi.advanceTimersByTime(2000)
    terminal.start()
    vi.advanceTimersByTime(2000)
    expect(terminal.status.value).toEqual({ kind: 'starting' })
  })

  it('should not reveal after it was disposed', () => {
    const terminal = createTerminalStatus(3000)
    terminal.spawned()
    terminal.dispose()
    vi.advanceTimersByTime(3000)
    expect(terminal.status.value).toEqual({ kind: 'starting' })
  })
})
