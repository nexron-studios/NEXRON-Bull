import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/views/ChatView.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/OverviewView.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/UsageView.vue', () => ({ default: { render: () => null } }))

/** Like the browser: a transition skipped by the next one rejects its `ready` with AbortError. */
const startViewTransition = vi.fn((update: () => Promise<void>) => {
  const ready = Promise.reject(new DOMException('Transition was skipped', 'AbortError'))
  const finished = update()
  return { ready, finished, updateCallbackDone: finished, skipTransition: () => {} }
})

// Node, not jsdom's window, reports a promise rejected without a handler; the app has no Node types.
interface RejectionEvents {
  on: (event: 'unhandledRejection', listener: (reason: unknown) => void) => void
  off: (event: 'unhandledRejection', listener: (reason: unknown) => void) => void
}
const nodeProcess = (globalThis as unknown as { process: RejectionEvents }).process

describe('router', () => {
  afterEach(() => {
    delete (document as { startViewTransition?: unknown }).startViewTransition
  })

  it('should take a page change whose transition was skipped without an unhandled rejection', async () => {
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    document.startViewTransition = startViewTransition as never
    const { default: router } = await import('../index')
    const unhandled: unknown[] = []
    const record = (reason: unknown) => unhandled.push(reason)
    nodeProcess.on('unhandledRejection', record)

    await router.push('/')
    await router.push('/overview')
    await new Promise((resolve) => setTimeout(resolve))
    nodeProcess.off('unhandledRejection', record)

    expect([router.currentRoute.value.name, unhandled.length]).toEqual(['overview', 0])
  })
})
