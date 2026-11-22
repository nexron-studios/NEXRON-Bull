import { afterEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_TRANSITION_ATTRIBUTE } from '@/utils/viewTransitions'
import { useLayoutSnap } from '../useLayoutSnap'

const ATTRIBUTE = 'data-panel-snap'
const OTHER_ATTRIBUTE = 'data-sidebar-snap'

/** jsdom has no View Transitions: this one runs the update when the test says the snapshot is taken. */
const stubViewTransition = () => {
  let update = async () => {}
  let end = () => {}
  let updated = () => {}
  const finished = new Promise<void>((resolve) => {
    end = resolve
  })
  const updateCallbackDone = new Promise<void>((resolve) => {
    updated = resolve
  })
  const start = vi.fn((callback: () => Promise<void>) => {
    update = callback
    return { ready: Promise.resolve(), finished, updateCallbackDone }
  })
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
  const takeSnapshot = async () => {
    await update()
    updated()
  }
  // Lets `finished.finally` run.
  const finish = async () => {
    end()
    await new Promise((resolve) => setTimeout(resolve))
  }
  return { start, takeSnapshot, finish }
}

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition')
  document.documentElement.removeAttribute(ROUTE_TRANSITION_ATTRIBUTE)
})

describe('useLayoutSnap', () => {
  it('should mark the root with its own attribute while the snap runs', async () => {
    const transition = stubViewTransition()
    const { snap } = useLayoutSnap(ATTRIBUTE)

    void snap(() => {}, true)
    const whileRunning = document.documentElement.getAttribute(ATTRIBUTE)
    await transition.takeSnapshot()
    await transition.finish()

    expect([whileRunning, document.documentElement.hasAttribute(ATTRIBUTE)]).toEqual(['', false])
  })

  it('should run every update that joined the snap, in order', async () => {
    const transition = stubViewTransition()
    const { snap } = useLayoutSnap(ATTRIBUTE)
    const applied: string[] = []

    void snap(() => applied.push('first'), true)
    void snap(() => applied.push('second'), true)
    await transition.takeSnapshot()
    await transition.finish()

    expect(applied).toEqual(['first', 'second'])
  })

  it('should let a snap of another part join the waiting one instead of starting its own', async () => {
    const transition = stubViewTransition()
    const panel = useLayoutSnap(ATTRIBUTE)
    const sidebar = useLayoutSnap(OTHER_ATTRIBUTE)

    void panel.snap(() => {}, true)
    void sidebar.snap(() => {}, true)
    const marked = [ATTRIBUTE, OTHER_ATTRIBUTE].map((name) =>
      document.documentElement.hasAttribute(name)
    )
    await transition.takeSnapshot()
    await transition.finish()

    expect({ marked, started: transition.start.mock.calls.length }).toEqual({
      marked: [true, true],
      started: 1
    })
  })

  it('should resolve once the update is applied', async () => {
    const transition = stubViewTransition()
    const { snap } = useLayoutSnap(ATTRIBUTE)
    let isApplied = false

    const done = snap(() => {
      isApplied = true
    }, true)
    await transition.takeSnapshot()
    await done
    await transition.finish()

    expect(isApplied).toBe(true)
  })

  it('should apply an update that keeps the layout at once', () => {
    stubViewTransition()
    const { snap } = useLayoutSnap(ATTRIBUTE)
    const applied: string[] = []

    void snap(() => applied.push('now'), false)

    expect(applied).toEqual(['now'])
  })

  it('should apply the update at once without the View Transitions API', () => {
    const { snap } = useLayoutSnap(ATTRIBUTE)
    const applied: string[] = []

    void snap(() => applied.push('now'), true)

    expect(applied).toEqual(['now'])
  })

  it('should apply the update at once during a page change', () => {
    const transition = stubViewTransition()
    document.documentElement.setAttribute(ROUTE_TRANSITION_ATTRIBUTE, 'next')
    const { snap } = useLayoutSnap(ATTRIBUTE)

    void snap(() => {}, true)

    expect(transition.start).not.toHaveBeenCalled()
  })
})
