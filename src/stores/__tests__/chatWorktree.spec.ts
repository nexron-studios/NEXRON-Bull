import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { AgentdEvent } from '@/types/agentd.type'
import { useDraftStore } from '@/stores/drafts'
import { useChatStore } from '../chat'

const { send, listeners } = vi.hoisted(() => ({
  send: vi.fn(() => Promise.resolve()),
  listeners: new Set<(event: AgentdEvent) => void>()
}))

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: {
    ask: vi.fn(),
    send,
    waitFor: vi.fn(),
    onEvent: (listener: (event: AgentdEvent) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onReady: () => () => {}
  }
}))

const REPO = 'C:\\dev\\projects\\app'
const WORKTREE = 'C:\\dev\\worktrees\\app-kalender-wochenansicht'

const emit = (event: AgentdEvent) => listeners.forEach((listener) => listener(event))

const openWorktreeChat = () => {
  const chat = useChatStore()
  chat.openNew({
    profile: null,
    account: 'office',
    cwd: REPO,
    machine: null,
    model: null,
    permissionMode: null,
    isWorktreePlanned: true
  })
  return { chat, tab: chat.tabs[0] }
}

describe('useChatStore: a chat in its own worktree', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    i18n.global.locale.value = 'de'
    send.mockClear()
    listeners.clear()
  })

  it('should not start Claude before the first message', () => {
    const { tab } = openWorktreeChat()

    expect(tab.status).toBe('ended')
    expect(send).not.toHaveBeenCalled()
  })

  it('should start Claude with a worktree named after the first message', () => {
    const { chat, tab } = openWorktreeChat()

    chat.send(tab.id, 'Kalender Wochenansicht', [])

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'start',
        tab: tab.id,
        cwd: REPO,
        worktree: { hint: 'Kalender Wochenansicht', root: null }
      }),
      null
    )
  })

  it('should name the worktree after the message as it goes out, notes included', () => {
    const { chat, tab } = openWorktreeChat()
    const shot = {
      id: 'a',
      name: 'shot.png',
      mediaType: 'image/png' as const,
      data: 'QUJD',
      src: 'data:image/png;base64,QUJD',
      bytes: 3,
      notes: [{ number: 1, text: 'Knopf größer' }]
    }

    chat.send(tab.id, '', [shot])

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'start',
        worktree: { hint: 'Zu [Bild 1 (shot.png)]: ① Knopf größer', root: null }
      }),
      null
    )
  })

  it('should work in the worktree agentd started Claude in', () => {
    const { chat, tab } = openWorktreeChat()
    chat.send(tab.id, 'Kalender', [])

    emit({
      type: 'started',
      id: null,
      tab: tab.id,
      session_id: 's1',
      working: false,
      cwd: WORKTREE
    })

    expect([chat.tabs[0].cwd, chat.tabs[0].isWorktreePlanned]).toEqual([WORKTREE, false])
  })

  it('should say why and start in the folder itself next time when the worktree is refused', () => {
    const { chat, tab } = openWorktreeChat()
    chat.send(tab.id, 'Kalender', [])

    emit({
      type: 'worktree_refused',
      id: null,
      tab: tab.id,
      kind: 'no_integration',
      message: 'no integration branch'
    })

    expect(chat.tabs[0].notice).toBe(
      'Das Repo hat keinen Integrationsbranch (dev, main oder master). Deine nächste Nachricht startet Claude ohne eigenen Worktree direkt im Ordner.'
    )
    expect([chat.tabs[0].status, chat.tabs[0].isWorktreePlanned]).toEqual(['ended', false])
    expect(useDraftStore().draftOf(tab.id).text).toBe('Kalender')
  })

  it('should ask for a first message before Claude is needed', async () => {
    const { chat, tab } = openWorktreeChat()

    await expect(chat.ensureStarted(tab.id)).rejects.toThrow(
      'Der Worktree dieses Chats entsteht mit der ersten Nachricht. Schreib zuerst etwas.'
    )
    expect(send).not.toHaveBeenCalled()
  })
})
