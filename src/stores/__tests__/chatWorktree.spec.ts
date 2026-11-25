import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { AgentdEvent } from '@/types/agentd.type'
import { useDraftStore } from '@/stores/drafts'
import { AgentdDisconnectedError } from '@/api/services/agentd.service'
import { useChatStore } from '../chat'

const { ask, send, waitFor, listeners } = vi.hoisted(() => ({
  ask: vi.fn(),
  waitFor: vi.fn(),
  send: vi.fn(() => Promise.resolve()),
  listeners: new Set<(event: AgentdEvent) => void>()
}))

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: {
    ask,
    send,
    waitFor,
    onEvent: (listener: (event: AgentdEvent) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
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
    listeners.clear()
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
      {
        op: 'create_worktree',
        cwd: REPO,
        hint: 'Kalender Wochenansicht',
        root: null,
        tab: tab.id
      },
      null
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'start', tab: tab.id, cwd: WORKTREE }),
      null
    )
    expect([chat.tabs[0].cwd, chat.tabs[0].worktreeFrom]).toEqual([WORKTREE, null])
  })

  it('should say so and start in the folder itself next time when the worktree fails', async () => {
    ask.mockRejectedValue(new Error('no integration branch'))
    const { chat, tab } = openWorktreeChat()

    chat.send(tab.id, 'Kalender', [])
    await vi.waitFor(() => expect(chat.tabs[0].status).toBe('ended'))

    expect(chat.tabs[0].notice).toBe(
      'Kein eigener Worktree: no integration branch. Deine nächste Nachricht startet Claude direkt im Ordner.'
    )
    expect(chat.tabs[0].worktreeFrom).toBeNull()
    expect(useDraftStore().draftOf(tab.id).text).toBe('Kalender')
    expect(send).not.toHaveBeenCalled()
  })

  it('should try the worktree again after a lost connection', async () => {
    ask.mockRejectedValue(new AgentdDisconnectedError(null))
    const { chat, tab } = openWorktreeChat()

    chat.send(tab.id, 'Kalender', [])
    await vi.waitFor(() => expect(chat.tabs[0].status).toBe('ended'))

    expect(chat.tabs[0].worktreeFrom).toBe(REPO)
    expect(send).not.toHaveBeenCalled()
  })

  it('should make one worktree when the tab is started again while it is on its way', async () => {
    let answer: (event: unknown) => void = () => {}
    ask.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const { chat, tab } = openWorktreeChat()

    chat.send(tab.id, 'Kalender', [])
    // The connection drops while agentd makes it: the tab ends, and the next message starts it.
    listeners.forEach((listener) =>
      listener({ type: 'disconnected', machine: null, connection: 1 })
    )
    chat.send(tab.id, 'Noch etwas', [])
    answer({
      type: 'worktree_created',
      id: 1,
      path: WORKTREE,
      branch: 'feat/kalender',
      base: 'origin/main'
    })
    await vi.waitFor(() => expect(send).toHaveBeenCalled())

    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('should remove the worktree when its tab was closed before it was made', async () => {
    let answer: (event: unknown) => void = () => {}
    ask.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    ask.mockResolvedValueOnce({
      type: 'worktree_removed',
      id: 2,
      outcome: { kind: 'removed', branch: 'feat/kalender' }
    })
    const { chat, tab } = openWorktreeChat()

    chat.send(tab.id, 'Kalender', [])
    chat.close(tab.id)
    answer({
      type: 'worktree_created',
      id: 1,
      path: WORKTREE,
      branch: 'feat/kalender',
      base: 'origin/main'
    })

    await vi.waitFor(() =>
      expect(ask).toHaveBeenLastCalledWith({ op: 'remove_worktree', worktree: WORKTREE }, null)
    )
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ op: 'start' }), null)
  })

  it('should wait for a worktree on its way before Claude is needed', async () => {
    let answer: (event: unknown) => void = () => {}
    ask.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    waitFor.mockResolvedValue({ type: 'started', tab: 'any' })
    const { chat, tab } = openWorktreeChat()

    chat.send(tab.id, 'Kalender', [])
    const started = chat.ensureStarted(tab.id)
    answer({
      type: 'worktree_created',
      id: 1,
      path: WORKTREE,
      branch: 'feat/kalender',
      base: 'origin/main'
    })

    await expect(started).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ op: 'start', cwd: WORKTREE }), null)
  })
})
