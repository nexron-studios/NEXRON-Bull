import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTerminalRequestStore } from '../terminalRequests'

describe('useTerminalRequestStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should hand out requests in the order they came and empty the queue', () => {
    const store = useTerminalRequestStore()
    store.request({ machine: null, cwd: 'C:\\me\\dev\\projects\\nexron-chat' })
    store.request({ machine: 'nexron-server', cwd: '~', command: 'claude /login' })

    expect(store.takeAll()).toEqual([
      { machine: null, cwd: 'C:\\me\\dev\\projects\\nexron-chat' },
      { machine: 'nexron-server', cwd: '~', command: 'claude /login' }
    ])
    expect(store.takeAll()).toEqual([])
  })
})
