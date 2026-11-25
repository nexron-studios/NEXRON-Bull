import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import ChatSessionBar from '../ChatSessionBar.vue'
import i18n from '@/i18n'
import type { MachineEntry } from '@/types/machine.type'
import { newTab } from '@/utils/chatTab'

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: {
    send: vi.fn(),
    ask: vi.fn(),
    waitFor: vi.fn(),
    onEvent: () => () => {},
    onReady: () => () => {}
  }
}))

const THIS_PC = i18n.global.t('chat.this_machine')

const tabOn = (machine: string | null) =>
  newTab({
    id: 't1',
    title: 'Chat',
    profile: null,
    account: 'work',
    cwd: String.raw`C:\work\app`,
    machine,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  })

const mountWith = async (machines: MachineEntry[], machine: string | null) => {
  const queryClient = new QueryClient()
  queryClient.setQueryData(['machines'], machines)
  const wrapper = shallowMount(ChatSessionBar, {
    props: { tab: tabOn(machine) },
    global: { plugins: [i18n, createPinia(), [VueQueryPlugin, { queryClient }]] }
  })
  await flushPromises()
  return wrapper
}

describe('ChatSessionBar', () => {
  it('should leave out this PC while it is the only machine', async () => {
    const wrapper = await mountWith([], null)
    expect(wrapper.text()).not.toContain(THIS_PC)
  })

  it('should name this PC once another machine is connected', async () => {
    const wrapper = await mountWith([{ name: 'nexron-server', host: 'nexron-server' }], null)
    expect(wrapper.text()).toContain(THIS_PC)
  })

  it('should keep the name of another machine', async () => {
    const wrapper = await mountWith([], 'nexron-server')
    expect(wrapper.text()).toContain('nexron-server')
  })
})
