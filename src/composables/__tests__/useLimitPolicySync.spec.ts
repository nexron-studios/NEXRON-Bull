import { effectScope, nextTick } from 'vue'
import { QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentdTimeoutError } from '@/api/services/agentd.service'
import { useLimitPolicyStore } from '@/stores/limitPolicy'
import { useLimitPolicySync } from '../useLimitPolicySync'

const { ask, machines, client } = vi.hoisted(() => ({
  ask: vi.fn(),
  machines: vi.fn(),
  client: { current: null as unknown }
}))

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: { ask, onEvent: () => () => {} }
}))
vi.mock('@/api/services/machine.service', () => ({ machineService: { list: machines } }))
vi.mock('@tanstack/vue-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/vue-query')>()),
  useQueryClient: () => client.current
}))

const DEFAULT_PUSH = {
  op: 'set_limits',
  policy: { mode: 'auto', suggest_early: true, order: [], rules: [], queue: true }
}
const TIMEOUT_MS = 20 * 1000

const startSync = () => {
  const scope = effectScope()
  scope.run(useLimitPolicySync)
  return scope
}

describe('useLimitPolicySync', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    setActivePinia(createPinia())
    queryClient = new QueryClient()
    client.current = queryClient
    ask.mockReset().mockResolvedValue({ type: 'limits_set', id: 1 })
    machines.mockReset().mockResolvedValue([{ name: 'server', host: 'server' }])
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should hand the policy to this computer and every SSH host at start', async () => {
    startSync()

    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(2))
    expect(ask.mock.calls).toEqual([
      [DEFAULT_PUSH, null, TIMEOUT_MS],
      [DEFAULT_PUSH, 'server', TIMEOUT_MS]
    ])
  })

  it('should push once more shortly after the policy changed', async () => {
    vi.useFakeTimers()
    startSync()
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(2))
    ask.mockClear()

    const store = useLimitPolicyStore()
    store.setMode('wait')
    store.setQueue(false)
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)

    expect(ask.mock.calls).toEqual([
      [
        { op: 'set_limits', policy: { ...DEFAULT_PUSH.policy, mode: 'wait', queue: false } },
        null,
        TIMEOUT_MS
      ],
      [
        { op: 'set_limits', policy: { ...DEFAULT_PUSH.policy, mode: 'wait', queue: false } },
        'server',
        TIMEOUT_MS
      ]
    ])
  })

  it('should only log a push that agentd refused', async () => {
    ask.mockImplementation((_request: unknown, machine: string | null) =>
      machine === 'server'
        ? Promise.reject(new Error('bad request: unknown variant'))
        : Promise.resolve()
    )

    startSync()

    await vi.waitFor(() =>
      expect(console.warn).toHaveBeenCalledWith('limits.push_failed', { machine: 'server' })
    )
    ask.mockClear()
    queryClient.setQueryData(['agentd', 'quota', 'server'], [])
    await nextTick()
    expect(ask.mock.calls).toEqual([])
  })

  it('should push again to a host that did not answer once it answers anything else', async () => {
    ask.mockImplementation((_request: unknown, machine: string | null) =>
      machine === 'server' ? Promise.reject(new AgentdTimeoutError('server')) : Promise.resolve()
    )
    startSync()
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalled())
    ask.mockReset().mockResolvedValue({ type: 'limits_set', id: 2 })

    queryClient.setQueryData(['agentd', 'quota', 'server'], [])

    await vi.waitFor(() => expect(ask).toHaveBeenCalledWith(DEFAULT_PUSH, 'server', TIMEOUT_MS))
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('should not push again to a host that already has the policy', async () => {
    startSync()
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(2))
    ask.mockClear()

    queryClient.setQueryData(['agentd', 'quota', 'server'], [])
    await nextTick()

    expect(ask.mock.calls).toEqual([])
  })
})
