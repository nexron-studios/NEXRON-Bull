import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '../chat'

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: {
    ask: vi.fn(() => new Promise(() => {})),
    send: vi.fn(() => Promise.resolve()),
    waitFor: vi.fn(() => new Promise(() => {})),
    onEvent: () => () => {},
    onReady: () => () => {}
  }
}))

const savedTab = (id: string, sessionId: string | null) => ({
  id,
  title: `Chat ${id}`,
  profile: null,
  account: 'office',
  cwd: 'C:\\work',
  machine: null,
  sessionId,
  model: null,
  permissionMode: null,
  isFresh: false
})

describe('saved tabs', () => {
  beforeEach(() => {
    localStorage.clear()
    // Pinia runs its plugins only once it is installed in an app.
    const pinia = createPinia().use(piniaPluginPersistedstate)
    createApp({}).use(pinia)
    setActivePinia(pinia)
  })
  afterEach(() => localStorage.clear())

  it('should reopen the started tabs an older Bull saved under "chat"', () => {
    localStorage.setItem(
      'chat',
      JSON.stringify({ activeId: 'b', tabs: [savedTab('a', null), savedTab('b', 's-b')] })
    )

    const chat = useChatStore()

    expect([chat.activeId, chat.tabs.map((tab) => `${tab.id}:${tab.status}`)]).toEqual([
      'b',
      ['b:ended']
    ])
  })

  it('should save a renamed tab under the same key', async () => {
    localStorage.setItem('chat', JSON.stringify({ activeId: 'b', tabs: [savedTab('b', 's-b')] }))
    const chat = useChatStore()

    chat.tabs[0].title = 'Neu'
    await nextTick()

    const stored = JSON.parse(localStorage.getItem('chat') ?? '{}')
    expect([stored.activeId, stored.tabs[0].title]).toEqual(['b', 'Neu'])
  })
})
