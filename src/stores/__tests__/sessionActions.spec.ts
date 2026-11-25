import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newTab } from '@/utils/chatTab'
import { targetOfTab } from '@/utils/sessionActions'
import { useChatStore } from '../chat'
import { useHiddenSessionsStore } from '../hiddenSessions'
import { useSessionActionsStore } from '../sessionActions'

const { toast, ask, send } = vi.hoisted(() => ({
  toast: vi.fn(),
  ask: vi.fn(),
  send: vi.fn(() => Promise.resolve())
}))

vi.mock('vue-sonner', () => ({ toast: Object.assign(toast, { error: vi.fn(), success: vi.fn() }) }))
vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: { ask, send, onEvent: () => () => {}, onReady: () => () => {}, waitFor: vi.fn() }
}))

const tab = (id: string) =>
  newTab({
    id,
    title: id,
    profile: null,
    account: 'office',
    cwd: 'C:\\work',
    machine: null,
    sessionId: `s-${id}`,
    model: null,
    permissionMode: null,
    isFresh: false
  })

/** Runs the "Rückgängig" of the last toast. */
const undoLastToast = () => {
  const [, options] = toast.mock.calls.at(-1) as [string, { action: { onClick: () => void } }]
  options.action.onClick()
}

describe('useSessionActionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    toast.mockClear()
  })

  it('should ask before a finished chat is removed from its tab', async () => {
    const chat = useChatStore()
    chat.tabs = ['a', 'b'].map(tab)
    const actions = useSessionActionsStore()

    actions.requestRemove(targetOfTab(chat.tabs[0]))
    expect(actions.confirmation?.kind).toBe('remove')
    expect(chat.tabs.map((open) => open.id)).toEqual(['a', 'b'])

    await actions.confirm()
    expect(chat.tabs.map((open) => open.id)).toEqual(['b'])
  })

  it('should ask to stop a working chat removed from its tab', () => {
    const chat = useChatStore()
    chat.tabs = [{ ...tab('a'), status: 'working' }]
    const actions = useSessionActionsStore()

    actions.requestRemove(targetOfTab(chat.tabs[0]))
    expect(actions.confirmation?.kind).toBe('stop_and_remove')
  })

  it('should put removed tabs back where they were on undo', async () => {
    const chat = useChatStore()
    chat.tabs = ['a', 'b', 'c', 'd'].map(tab)
    const actions = useSessionActionsStore()

    actions.removeAll([chat.tabs[1], chat.tabs[3], chat.tabs[0]].map(targetOfTab))
    await vi.waitFor(() => expect(toast).toHaveBeenCalled())
    expect(chat.tabs.map((open) => open.id)).toEqual(['c'])

    undoLastToast()
    expect(chat.tabs.map((open) => open.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('should list a removed session again on undo', async () => {
    const chat = useChatStore()
    chat.tabs = [tab('a')]
    const actions = useSessionActionsStore()

    actions.removeAll([targetOfTab(chat.tabs[0])])
    await vi.waitFor(() => expect(toast).toHaveBeenCalled())
    const hidden = useHiddenSessionsStore()
    expect(Object.keys(hidden.hidden)).toEqual(['|office:s-a'])

    undoLastToast()
    expect([Object.keys(hidden.hidden), chat.tabs.map((open) => open.id)]).toEqual([[], ['a']])
  })
})
