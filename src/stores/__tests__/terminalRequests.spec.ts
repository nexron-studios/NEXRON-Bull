import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '@/i18n'
import { useTerminalRequestStore } from '../terminalRequests'

const { runtime, info } = vi.hoisted(() => ({ runtime: { isDesktopApp: true }, info: vi.fn() }))

vi.mock('@/lib/platform', () => ({ isDesktopApp: () => runtime.isDesktopApp }))
vi.mock('vue-sonner', () => ({ toast: { info } }))

describe('useTerminalRequestStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    runtime.isDesktopApp = true
  })

  it('should say in a browser that terminals need the app, and queue nothing', () => {
    runtime.isDesktopApp = false
    i18n.global.locale.value = 'de'
    const store = useTerminalRequestStore()

    store.request({ machine: null, cwd: 'C:\\work' })

    expect(store.takeAll()).toEqual([])
    expect(info).toHaveBeenCalledWith(
      'Das geht nur in der Bull-App am PC: Hier im Browser gibt es kein Terminal.'
    )
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
