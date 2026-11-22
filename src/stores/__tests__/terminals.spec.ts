import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTerminalStore } from '../terminals'

const HERE = { machine: null, cwd: 'C:\\me\\dev\\projects\\nexron-chat' }

describe('useTerminalStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('openTab', () => {
    it('should add a terminal tab and show it', () => {
      const store = useTerminalStore()
      const id = store.openTab({ ...HERE, title: 'Login' })
      expect(store.activeTab).toEqual({ ...HERE, title: 'Login', id, shell: null, drawerOf: null })
    })
  })

  describe('showOrOpenTab', () => {
    it('should show the tab already open in that folder instead of a second one', () => {
      const store = useTerminalStore()
      const first = store.openTab(HERE)
      store.activeTabId = null
      expect(store.showOrOpenTab(HERE)).toBe(first)
      expect([store.tabs.length, store.activeTabId]).toEqual([1, first])
    })
  })

  describe('toggleDrawer', () => {
    it('should start a shell in the chat folder the first time and then only show or hide', () => {
      const store = useTerminalStore()
      store.toggleDrawer('chat-1', HERE)
      const [entry] = store.drawerTerminalsOf('chat-1')
      expect(store.drawerOf('chat-1')).toEqual({ isOpen: true, activeId: entry?.id })
      store.toggleDrawer('chat-1', HERE)
      expect(store.drawerOf('chat-1').isOpen).toBe(false)
      store.toggleDrawer('chat-1', HERE)
      expect([store.drawerOf('chat-1').isOpen, store.drawerTerminalsOf('chat-1').length]).toEqual([
        true,
        1
      ])
    })

    it('should keep each chat its own drawer and no terminal tab', () => {
      const store = useTerminalStore()
      store.toggleDrawer('chat-1', HERE)
      expect([store.drawerOf('chat-2').isOpen, store.tabs.length, store.activeTabId]).toEqual([
        false,
        0,
        null
      ])
    })
  })

  describe('maximize', () => {
    it('should move the terminal to a tab and close the emptied drawer', () => {
      const store = useTerminalStore()
      const id = store.openInDrawer('chat-1', HERE)
      store.maximize(id)
      expect([store.activeTab?.id, store.activeTab?.drawerOf, store.drawerOf('chat-1')]).toEqual([
        id,
        null,
        { isOpen: false, activeId: null }
      ])
    })
  })

  describe('close', () => {
    it('should show the previous drawer terminal after closing the shown one', () => {
      const store = useTerminalStore()
      const first = store.openInDrawer('chat-1', HERE)
      const second = store.openInDrawer('chat-1', HERE)
      store.close(second)
      expect(store.drawerOf('chat-1')).toEqual({ isOpen: true, activeId: first })
    })

    it('should go back to the chat after closing the shown tab', () => {
      const store = useTerminalStore()
      const id = store.openTab(HERE)
      store.close(id)
      expect([store.activeTabId, store.tabs.length]).toEqual([null, 0])
    })
  })

  describe('closeDrawersExcept', () => {
    it('should drop the drawers of closed chats and keep the tabs', () => {
      const store = useTerminalStore()
      store.openInDrawer('chat-1', HERE)
      store.openInDrawer('chat-2', HERE)
      const tab = store.openTab(HERE)
      store.closeDrawersExcept(['chat-2'])
      expect(store.terminals.map((entry) => entry.drawerOf ?? entry.id)).toEqual(['chat-2', tab])
      expect(Object.keys(store.drawers)).toEqual(['chat-2'])
    })
  })

  describe('setShell', () => {
    it('should remember which shell started', () => {
      const store = useTerminalStore()
      const id = store.openTab(HERE)
      store.setShell(id, 'cmd')
      expect(store.activeTab?.shell).toBe('cmd')
    })
  })
})
