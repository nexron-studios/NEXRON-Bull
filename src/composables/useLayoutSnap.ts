import { nextTick } from 'vue'
import { ROUTE_TRANSITION_ATTRIBUTE, isSkippedTransition } from '@/utils/viewTransitions'

// One queue for every layout snap (sidebar and info panel alike): a second startViewTransition
// would skip the first, so snaps that start before the old snapshot is taken share one transition.
let pending: (() => void) | null = null
let waiting: Promise<void> | null = null
let waitingAttributes: Set<string> | null = null
// How many running transitions name each attribute; it leaves <html> with the last of them.
const running = new Map<string, number>()

const markRunning = (attributes: Set<string>, attribute: string) => {
  if (attributes.has(attribute)) return
  attributes.add(attribute)
  running.set(attribute, (running.get(attribute) ?? 0) + 1)
  document.documentElement.setAttribute(attribute, '')
}

const release = (attributes: Set<string>) => {
  for (const attribute of attributes) {
    const left = (running.get(attribute) ?? 1) - 1
    if (left) running.set(attribute, left)
    else {
      running.delete(attribute)
      document.documentElement.removeAttribute(attribute)
    }
  }
}

/**
 * Animates a jump of the layout (the sidebar between rail, panel and full width, the info panel
 * in and out) through the View Transitions API: the browser morphs snapshots of the parts on the
 * compositor instead of animating their width frame by frame. `attribute` sits on `<html>` while
 * the snap runs; only then do the parts carry their transition names (transitions.css). Without
 * the API, or during a page change, the update applies at once.
 */
export const useLayoutSnap = (attribute: string) => {
  /**
   * Applies `update`, as a snap when it shows `isNewLayout`; resolves once it is applied. While a
   * snap waits for its old snapshot, every update joins it and runs after the ones before, so two
   * toggles in one frame cancel out and a drag across a snap point ends at its latest size.
   */
  const snap = (update: () => void, isNewLayout: boolean): Promise<void> => {
    if (pending && waiting && waitingAttributes) {
      const before = pending
      pending = () => {
        before()
        update()
      }
      if (isNewLayout) markRunning(waitingAttributes, attribute)
      return waiting
    }
    const root = document.documentElement
    if (
      !isNewLayout ||
      !document.startViewTransition ||
      root.hasAttribute(ROUTE_TRANSITION_ATTRIBUTE)
    ) {
      update()
      return Promise.resolve()
    }
    const attributes = new Set<string>()
    pending = update
    waitingAttributes = attributes
    markRunning(attributes, attribute)
    const transition = document.startViewTransition(async () => {
      const apply = pending
      pending = null
      waiting = null
      waitingAttributes = null
      apply?.()
      await nextTick()
    })
    waiting = transition.updateCallbackDone
    void transition.ready.catch((error: unknown) => {
      if (!isSkippedTransition(error)) throw error
    })
    // A later snap skips this one (it jumps to its end); names stay for the one still running.
    void transition.finished.finally(() => release(attributes))
    return waiting
  }

  return { snap }
}
