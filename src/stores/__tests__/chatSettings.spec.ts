import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newTab, type TabStatus } from '@/utils/chatTab'
import { useChatStore } from '../chat'
import { useChatSettingsStore } from '../chatSettings'

const { ask } = vi.hoisted(() => ({ ask: vi.fn() }))

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: { ask, send: vi.fn(), onEvent: () => () => {}, waitFor: vi.fn() }
}))

const openTab = (status: TabStatus) => {
  const chat = useChatStore()
  chat.tabs = [
    {
      ...newTab({
        id: 't1',
        title: 'Export',
        profile: null,
        account: 'work',
        cwd: 'C:\work',
        machine: 'nexron-server',
        sessionId: 's1',
        model: 'opus',
        permissionMode: 'default',
        isFresh: false
      }),
      status
    }
  ]
  return chat
}

describe('useChatSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ask.mockReset()
  })

  it('should send a new mode to the running Claude of the tab', async () => {
    ask.mockResolvedValue({ type: 'configured', id: 1, tab: 't1' })
    const chat = openTab('idle')

    await useChatSettingsStore().setMode('t1', 'plan')

    expect(ask).toHaveBeenCalledWith(
      { op: 'configure', tab: 't1', permission_mode: 'plan', model: null, effort: null },
      'nexron-server',
      15_000
    )
    expect(chat.tabs[0]?.permissionMode).toBe('plan')
  })

  it('should keep a change of a stopped tab for its next start without asking agentd', async () => {
    const chat = openTab('ended')

    await useChatSettingsStore().setEffort('t1', 'max')

    expect(ask).not.toHaveBeenCalled()
    expect(chat.tabs[0]?.effort).toBe('max')
  })

  it('should put the old model back when agentd refuses the change', async () => {
    ask.mockRejectedValue(new Error('no running tab t1'))
    const chat = openTab('working')

    await useChatSettingsStore().setModel('t1', 'haiku')

    expect(chat.tabs[0]?.model).toBe('opus')
  })

  it('should keep a later change when an earlier one is refused', async () => {
    let refuse: (error: Error) => void = () => {}
    ask.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)))
    ask.mockResolvedValueOnce({ type: 'configured', id: 2, tab: 't1' })
    const chat = openTab('idle')
    const settings = useChatSettingsStore()

    const first = settings.setMode('t1', 'acceptEdits')
    await settings.setMode('t1', 'plan')
    refuse(new Error('mode refused'))
    await first

    expect(chat.tabs[0]?.permissionMode).toBe('plan')
  })

  it('should forget the window of the model a tab leaves', async () => {
    const chat = openTab('ended')
    chat.tabs = chat.tabs.map((tab) => ({ ...tab, contextWindow: 1_000_000 }))

    await useChatSettingsStore().setModel('t1', 'haiku')

    expect(chat.tabs[0]?.contextWindow).toBe(null)
  })

  it('should keep the window when the same model is picked again', async () => {
    const chat = openTab('ended')
    chat.tabs = chat.tabs.map((tab) => ({ ...tab, contextWindow: 1_000_000 }))

    await useChatSettingsStore().setModel('t1', 'opus')

    expect(chat.tabs[0]?.contextWindow).toBe(1_000_000)
  })

  it('should open the model picker of one tab', () => {
    const settings = useChatSettingsStore()
    settings.openModelPicker('t1')
    expect(settings.pickerTabId).toBe('t1')
    settings.closeModelPicker()
    expect(settings.pickerTabId).toBe(null)
  })
})
