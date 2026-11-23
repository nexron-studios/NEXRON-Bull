import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { AgentdEvent } from '@/types/agentd.type'
import { useDraftStore } from '@/stores/drafts'
import { useChatStore } from '../chat'

const { ask, send } = vi.hoisted(() => ({
  ask: vi.fn(),
  send: vi.fn(() => Promise.resolve())
}))

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: {
    ask,
    send,
    waitFor: vi.fn(),
    onEvent: (_listener: (event: AgentdEvent) => void) => () => {}
  }
}))

const REPO = 'C:\\dev\\projects\\app'
const WORKTREE = 'C:\\dev\\worktrees\\app-kalender-wochenansicht'

const openWorktreeChat = () => {
  const chat = useChatStore()
  chat.openNew({
    profile: null,
    account: 'office',
    cwd: REPO,
    machine: null,
    model: null,
    permissionMode: null,
    worktreeFrom: REPO
  })
  return { chat, tab: chat.tabs[0] }
}

describe('useChatStore: a chat in its own worktree', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    i18n.global.locale.value = 'de'
    ask.mockReset()
    send.mockClear()
  })

  it('should not start Claude before the first message', () => {
    const { tab } = openWorktreeChat()

    expect(tab.status).toBe('ended')
    expect(send).not.toHaveBeenCalled()
  })

  it('should name the worktree after the first message and start Claude in it', async () => {
    ask.mockResolvedValue({
      type: 'worktree_created',
      id: 1,
      path: WORKTREE,
      branch: 'feat/kalender-wochenansicht',
      base: 'origin/main'
    })
    const { chat, tab } = openWorktreeChat()

    chat.send(tab.id, 'Kalender Wochenansicht', [])
    await vi.waitFor(() => expect(send).toHaveBeenCalled())

    expect(ask).toHaveBeenCalledWith(
      { op: 'create_worktree', cwd: REPO, hint: 'Kalender Wochenansicht', root: null },
      null
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'start', tab: tab.id, cwd: WORKTREE }),
      null
    )
    expect([chat.tabs[0].cwd, chat.tabs[0].worktreeFrom]).toEqual([WORKTREE, null])
  })

  it('should keep the chat out of the main checkout when the worktree fails', async () => {
    ask.mockRejectedValue(new Error('no integration branch'))
    const { chat, tab } = openWorktreeChat()

    chat.send(tab.id, 'Kalender', [])
    await vi.waitFor(() => expect(chat.tabs[0].notice).toBe('no integration branch'))

    expect(chat.tabs[0].status).toBe('ended')
    expect(chat.tabs[0].worktreeFrom).toBe(REPO)
    expect(useDraftStore().draftOf(tab.id).text).toBe('Kalender')
    expect(send).not.toHaveBeenCalled()
  })
})
