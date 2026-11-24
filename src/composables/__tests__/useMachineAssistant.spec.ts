import { QueryClient } from '@tanstack/vue-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallFailedError } from '@/api/services/machine.service'
import type { MachineEntry, MachineProbe } from '@/types/machine.type'
import { useMachineAssistant } from '../useMachineAssistant'

const { service, client } = vi.hoisted(() => ({
  service: {
    add: vi.fn(),
    remove: vi.fn(),
    test: vi.fn(),
    install: vi.fn()
  },
  client: { current: null as unknown }
}))

vi.mock('@/api/services/machine.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/machine.service')>()),
  machineService: service
}))
vi.mock('@tanstack/vue-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/vue-query')>()),
  useQueryClient: () => client.current
}))

const SERVER: MachineEntry = { name: 'server', host: 'server' }
const NO_AGENTD: MachineProbe = {
  reason: 'no_agentd',
  version: null,
  detail: null,
  known_host: null,
  os: 'linux'
}
const OK: MachineProbe = {
  reason: 'ok',
  version: '0.1.0',
  detail: null,
  known_host: null,
  os: 'linux'
}

describe('useMachineAssistant', () => {
  beforeEach(() => {
    client.current = new QueryClient()
    Object.values(service).forEach((mock) => mock.mockReset())
    service.add.mockResolvedValue([SERVER])
    service.test.mockResolvedValue(NO_AGENTD)
  })

  it('should list the machine with its first check and show what the check found', async () => {
    const { state, check } = useMachineAssistant()
    await check(SERVER)
    expect(service.add).toHaveBeenCalledWith(SERVER, null)
    expect(state.value).toEqual({ step: 'checked', entry: SERVER, probe: NO_AGENTD })
  })

  it('should reload the accounts of a machine whose check answers', async () => {
    service.test.mockResolvedValue(OK)
    const queryClient = client.current as QueryClient
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { check } = useMachineAssistant()
    await check(SERVER)
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ['agentd'] })
  })

  it('should reload the list once a check found the system there', async () => {
    const queryClient = client.current as QueryClient
    const { check } = useMachineAssistant()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await check(SERVER)
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenNthCalledWith(2, { queryKey: ['machines'] })
  })

  it('should leave the accounts alone while the machine does not answer', async () => {
    const queryClient = client.current as QueryClient
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { check } = useMachineAssistant()
    await check(SERVER)
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['agentd'] })
  })

  it('should replace the entry an earlier check of the same run added', async () => {
    const { check } = useMachineAssistant()
    await check(SERVER)
    const corrected = { name: 'server', host: '10.0.0.2', user: 'alex' }
    await check(corrected)
    expect(service.add).toHaveBeenLastCalledWith(corrected, 'server')
  })

  it('should go back to the form with the machine as last checked', async () => {
    const { state, check, back } = useMachineAssistant()
    await check(SERVER)
    back()
    expect(state.value).toEqual({ step: 'pick', entry: SERVER })
  })

  it('should keep a machine a card asks to check in its place', async () => {
    const { start } = useMachineAssistant()
    start({ purpose: 'check', entry: SERVER })
    await vi.waitFor(() => expect(service.test).toHaveBeenCalledWith(SERVER))
    expect(service.add).toHaveBeenCalledWith(SERVER, 'server')
  })

  it('should end in done after an install whose check answers', async () => {
    service.install.mockResolvedValue(OK)
    const { state, install } = useMachineAssistant()
    await install(SERVER)
    expect(state.value).toEqual({ step: 'done', entry: SERVER, probe: OK })
  })

  it('should show why an install stopped', async () => {
    service.install.mockRejectedValue(new InstallFailedError({ kind: 'tabs_running', count: 2 }))
    const { state, install } = useMachineAssistant()
    await install(SERVER)
    expect(state.value).toEqual({
      step: 'install_failed',
      entry: SERVER,
      failure: { kind: 'tabs_running', count: 2 }
    })
  })
})
