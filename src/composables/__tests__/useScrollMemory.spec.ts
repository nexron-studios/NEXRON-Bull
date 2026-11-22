import { createApp, defineComponent, nextTick, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScrollMemory } from '../useScrollMemory'

type LeaveGuard = (to: unknown, from: { fullPath: string }) => void

const router = vi.hoisted(() => ({ leave: null as LeaveGuard | null }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/overview' }),
  onBeforeRouteLeave: (guard: LeaveGuard) => {
    router.leave = guard
  }
}))

/** A scroll area that ends far below where the list was left, so every position is reachable. */
const scrollArea = () => {
  const element = document.createElement('main')
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 5000 })
  element.scrollTo = vi.fn()
  return element
}

const mounted: App[] = []

/** The list's start sits 300 px into the page content and moves up as the page scrolls. */
const LIST_START_PX = 300

/** Mounts the list's use of the composable on fresh elements; resolves once mounted. */
const mountList = async (onRestored = vi.fn()) => {
  const scroller = scrollArea()
  const anchor = document.createElement('section')
  anchor.getBoundingClientRect = () => new DOMRect(0, LIST_START_PX - scroller.scrollTop, 0, 0)
  const app = createApp(
    defineComponent({
      setup() {
        const memory = useScrollMemory('done', scroller, anchor, 30, true, () => 40)
        memory.onRestored(onRestored)
        return () => null
      }
    })
  )
  app.mount(document.createElement('div'))
  mounted.push(app)
  await nextTick()
  return { scroller, onRestored }
}

// Unmounted, no list keeps a leave guard or a position the next test would pick up.
afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount())
  router.leave = null
})

describe('useScrollMemory', () => {
  it('scrolls back and reports it when the list returns to the URL it was left at', async () => {
    const first = await mountList()
    first.scroller.scrollTop = 700
    router.leave?.({}, { fullPath: '/overview' })

    const { scroller, onRestored } = await mountList()

    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 700 })
    expect(onRestored).toHaveBeenCalledTimes(1)
  })

  it('reports nothing when there is no position to go back to', async () => {
    const { scroller, onRestored } = await mountList()

    expect(scroller.scrollTo).not.toHaveBeenCalled()
    expect(onRestored).not.toHaveBeenCalled()
  })
})
