import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
let deliver: (payload: string) => void = () => undefined

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_name: string, handler: (event: { payload: string }) => void) => {
    deliver = (payload) => handler({ payload })
    return () => undefined
  }
}))

const { AgentdDisconnectedError, AgentdTimeoutError, agentdService } =
  await import('../agentd.service')

/** The id the service put on the last request line. */
const lastRequestId = (): number => JSON.parse(invoke.mock.lastCall?.[1].line).id

describe('agentdService.ask', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    invoke.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should resolve with the answer and clear its timeout', async () => {
    invoke.mockResolvedValue(undefined)
    const asked = agentdService.ask<'running'>({ op: 'running' }, null, 1000)
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled())
    deliver(JSON.stringify({ type: 'running', id: lastRequestId(), tabs: ['t1'] }))

    await expect(asked).resolves.toEqual({ type: 'running', id: lastRequestId(), tabs: ['t1'] })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('should reject with a timeout error naming the machine', async () => {
    invoke.mockResolvedValue(undefined)
    const asked = agentdService.ask({ op: 'quota', force: false }, 'nexron-server', 1000)
    const failed = expect(asked).rejects.toEqual(new AgentdTimeoutError('nexron-server'))
    await vi.advanceTimersByTimeAsync(1000)
    await failed
  })

  // An unreachable SSH host: ssh gives up, its connection ends, and no answer ever comes.
  it('should reject a request without timeout once its connection ends', async () => {
    invoke.mockResolvedValue(7)
    const asked = agentdService.ask({ op: 'profiles' }, 'nexron-server')
    const failed = expect(asked).rejects.toEqual(new AgentdDisconnectedError('nexron-server'))
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(0)
    deliver(JSON.stringify({ type: 'disconnected', machine: 'nexron-server', connection: 7 }))

    await failed
  })

  it('should reject a request whose connection ended before it said which one it was', async () => {
    let finishSend: (connection: number) => void = () => undefined
    invoke.mockReturnValue(new Promise<number>((resolve) => (finishSend = resolve)))
    const asked = agentdService.ask({ op: 'recent', limit: 30 }, 'nexron-server')
    const failed = expect(asked).rejects.toEqual(new AgentdDisconnectedError('nexron-server'))
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled())
    deliver(JSON.stringify({ type: 'disconnected', machine: 'nexron-server', connection: 9 }))
    finishSend(9)

    await failed
  })

  // The old connection's event can arrive after a new request already went out on the next one.
  it('should keep waiting when an earlier connection of the same machine ends', async () => {
    invoke.mockResolvedValue(8)
    const asked = agentdService.ask<'running'>({ op: 'running' }, null, 1000)
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(0)
    const id = lastRequestId()
    deliver(JSON.stringify({ type: 'disconnected', machine: null, connection: 6 }))
    deliver(JSON.stringify({ type: 'running', id, tabs: [] }))

    await expect(asked).resolves.toEqual({ type: 'running', id, tabs: [] })
    expect(vi.getTimerCount()).toBe(0)
  })

  // Vitest fails the run on an unhandled rejection, which the old code produced here.
  it('should reject with the agentd error while the request is still on its way', async () => {
    let finishSend: () => void = () => undefined
    invoke.mockReturnValue(new Promise<void>((resolve) => (finishSend = resolve)))
    const asked = agentdService.ask({ op: 'usage', days: 7 }, null, 1000)
    const failed = expect(asked).rejects.toThrow('bad request')
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled())
    deliver(
      JSON.stringify({ type: 'error', id: lastRequestId(), tab: null, message: 'bad request' })
    )
    await vi.advanceTimersByTimeAsync(0)
    finishSend()

    await failed
  })
})
