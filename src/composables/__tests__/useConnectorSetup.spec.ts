import { defineComponent, nextTick, reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentdTimeoutError } from '@/api/services/agentd.service'
import { useConnectorSetupStore } from '@/stores/connectorSetup'
import type { TabStatus } from '@/utils/chatTab'
import type { Connector } from '@/utils/tabInsights'
import { useConnectorSetup } from '../useConnectorSetup'

const { chat, handleError } = vi.hoisted(() => ({
  chat: {
    tabs: [] as { id: string; status: TabStatus; connectors: Connector[] | null }[],
    reloadMcpConfig: vi.fn(),
    refreshConnectors: vi.fn(),
    restart: vi.fn()
  },
  handleError: vi.fn()
}))

vi.mock('@/stores/chat', () => ({ useChatStore: () => chat }))
vi.mock('@/lib/error', () => ({ handleError }))

const PROBE: Connector[] = [{ name: 'probe', status: 'connected' }]

const mountSetup = () => {
  let setup: ReturnType<typeof useConnectorSetup> | undefined
  const host = defineComponent({
    setup: () => {
      setup = useConnectorSetup('t1')
      return () => null
    }
  })
  const wrapper = mount(host)
  if (!setup) throw new Error('no connector setup')
  return { setup, wrapper }
}

const refocus = async () => {
  window.dispatchEvent(new Event('blur'))
  await nextTick()
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
}

describe('useConnectorSetup', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chat.tabs = reactive([{ id: 't1', status: 'idle', connectors: [] }])
    chat.reloadMcpConfig.mockReset().mockResolvedValue({})
    chat.refreshConnectors.mockReset()
    chat.restart.mockReset().mockResolvedValue(undefined)
    handleError.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not look before the user went to the setup terminal and came back', async () => {
    const { setup, wrapper } = mountSetup()

    setup.markOpened()
    await flushPromises()

    expect(chat.reloadMcpConfig).not.toHaveBeenCalled()
    expect(setup.setup.value).toBe('due')
    wrapper.unmount()
  })

  it('should reload once the chat shows again and end the setup when servers came', async () => {
    useConnectorSetupStore().set('t1', 'due')
    chat.refreshConnectors.mockResolvedValue(PROBE)

    const { setup, wrapper } = mountSetup()
    await flushPromises()

    expect(chat.reloadMcpConfig).toHaveBeenCalledWith('t1')
    expect(chat.refreshConnectors).toHaveBeenCalledWith('t1')
    expect(setup.setup.value).toBe(null)
    wrapper.unmount()
  })

  it('should look only once on its own, then on "Neu laden"', async () => {
    useConnectorSetupStore().set('t1', 'due')
    chat.refreshConnectors.mockResolvedValueOnce([]).mockResolvedValueOnce(PROBE)
    const { setup, wrapper } = mountSetup()
    await flushPromises()
    expect(setup.setup.value).toBe('checked')

    await refocus()
    expect(chat.reloadMcpConfig.mock.calls).toEqual([['t1']])

    await setup.check()

    expect(chat.reloadMcpConfig.mock.calls).toEqual([['t1'], ['t1']])
    expect(setup.setup.value).toBe(null)
    wrapper.unmount()
  })

  it('should look when the window gets focus back from a terminal outside Bull', async () => {
    chat.refreshConnectors.mockResolvedValue(PROBE)
    const { setup, wrapper } = mountSetup()
    setup.markOpened()

    await refocus()

    expect(chat.reloadMcpConfig.mock.calls).toEqual([['t1']])
    expect(setup.setup.value).toBe(null)
    wrapper.unmount()
  })

  it('should wait for the running turn and reload once Claude is idle', async () => {
    useConnectorSetupStore().set('t1', 'due')
    chat.tabs[0].status = 'working'
    chat.refreshConnectors.mockResolvedValue(PROBE)
    const { setup, wrapper } = mountSetup()
    await flushPromises()
    expect(chat.reloadMcpConfig).not.toHaveBeenCalled()

    chat.tabs[0].status = 'idle'
    await flushPromises()

    expect(chat.reloadMcpConfig).toHaveBeenCalledWith('t1')
    expect(setup.setup.value).toBe(null)
    wrapper.unmount()
  })

  it('should ask again while a reloaded server still connects', async () => {
    vi.useFakeTimers()
    useConnectorSetupStore().set('t1', 'due')
    chat.refreshConnectors
      .mockResolvedValueOnce([{ name: 'probe', status: 'pending' }])
      .mockResolvedValueOnce(PROBE)
    const { wrapper } = mountSetup()

    await vi.advanceTimersByTimeAsync(1000)

    expect(chat.refreshConnectors.mock.calls).toEqual([['t1'], ['t1']])
    wrapper.unmount()
  })

  it('should not suggest a restart when Claude only did not answer in time', async () => {
    useConnectorSetupStore().set('t1', 'due')
    const timeout = new AgentdTimeoutError(null)
    chat.reloadMcpConfig.mockRejectedValue(timeout)
    const { setup, wrapper } = mountSetup()
    await flushPromises()

    expect(setup.setup.value).toBe('checked')
    expect(handleError).toHaveBeenCalledWith(timeout)
    wrapper.unmount()
  })

  it('should offer a restart when this Claude cannot reload, and list the servers after it', async () => {
    useConnectorSetupStore().set('t1', 'due')
    chat.reloadMcpConfig.mockRejectedValue(new Error('Unsupported control request subtype'))
    chat.refreshConnectors.mockResolvedValue(PROBE)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { setup, wrapper } = mountSetup()
    await flushPromises()
    expect(setup.setup.value).toBe('restart')

    await setup.restart()

    expect(chat.restart).toHaveBeenCalledWith('t1')
    expect(chat.refreshConnectors).toHaveBeenCalledWith('t1')
    expect(setup.setup.value).toBe(null)
    expect(warn).toHaveBeenCalledWith('connectors.reload_failed', {
      message: 'Unsupported control request subtype'
    })
    warn.mockRestore()
    wrapper.unmount()
  })
})
