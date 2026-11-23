import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from '@/stores/chat'
import { useTerminalRequestStore } from '@/stores/terminalRequests'
import { useTerminalStore } from '@/stores/terminals'
import { useTerminals } from '../useTerminals'

// Terminals exist in the app window only; the browser case is in terminalRequests.spec.
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  isTauri: () => true
}))
// The terminals themselves (xterm, shells) are not part of what is tested here.
vi.mock('@/lib/terminalSession', () => ({
  createTerminalSession: vi.fn(),
  prepareTerminals: vi.fn(() => Promise.resolve([]))
}))
// No chat open; the real store would reach for agentd.
vi.mock('@/stores/chat', async () => {
  const { ref } = await import('vue')
  const { defineStore } = await import('pinia')
  return {
    useChatStore: defineStore('chat', () => ({
      activeId: ref<string | null>(null),
      activeTab: ref(null),
      tabs: ref([])
    }))
  }
})

describe('useTerminals', () => {
  let scope = effectScope()

  beforeEach(() => {
    setActivePinia(createPinia())
    scope = effectScope()
  })
  afterEach(() => {
    scope.stop()
  })

  it('should open a terminal tab for every request, in order, and empty the queue', async () => {
    const requests = useTerminalRequestStore()
    const terminals = useTerminalStore()
    scope.run(() => useTerminals())

    requests.request({
      machine: 'nexron-server',
      cwd: '',
      command: 'claude /login',
      env: { CLAUDE_CONFIG_DIR: 'C:\\Users\\me\\.claude-kunde-x' },
      title: 'Login kunde-x'
    })
    requests.request({ machine: null, cwd: 'C:\\work' })
    await nextTick()

    expect(
      terminals.tabs.map(({ machine, cwd, command, env, title }) => ({
        machine,
        cwd,
        command,
        env,
        title
      }))
    ).toEqual([
      {
        machine: 'nexron-server',
        cwd: '',
        command: 'claude /login',
        env: { CLAUDE_CONFIG_DIR: 'C:\\Users\\me\\.claude-kunde-x' },
        title: 'Login kunde-x'
      },
      { machine: null, cwd: 'C:\\work', command: undefined, env: undefined, title: undefined }
    ])
    expect(requests.pending).toEqual([])
    expect(terminals.activeTabId).toBe(terminals.tabs[1]?.id)
  })

  it('should take requests that came before the app was ready', () => {
    const requests = useTerminalRequestStore()
    requests.request({ machine: null, cwd: 'C:\\early' })
    scope.run(() => useTerminals())
    expect(useTerminalStore().tabs.map((entry) => entry.cwd)).toEqual(['C:\\early'])
  })

  it('should open "Terminal here" in the home folder while no chat is open', () => {
    const terminals = useTerminalStore()
    const wiring = scope.run(() => useTerminals())
    wiring?.openHere()
    expect(terminals.activeTab?.cwd).toBe('')
  })

  it('should show the chat again once one is picked', async () => {
    const terminals = useTerminalStore()
    scope.run(() => useTerminals())
    terminals.openTab({ machine: null, cwd: 'C:\work' })
    useChatStore().activeId = 'chat-1'
    await nextTick()
    expect(terminals.activeTabId).toBe(null)
  })
})
