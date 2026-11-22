import { nextTick, ref, toValue, type MaybeRefOrGetter } from 'vue'

/** The motion.css classes a list puts on its rows while it enters, and their keyframes. */
const ENTRANCE_SELECTOR = '.motion-stagger, .motion-fade-in'
const ENTRANCE_ANIMATIONS = ['motion-enter', 'motion-fade-in']
/**
 * The entrance ends by then at the latest: a minimised window stops animations. Far above the
 * route transition's hold plus the 440 ms cascade, which took up to a second in a headless
 * Chromium.
 */
const MAX_ENTRANCE_MS = 2000

/**
 * The row entrances, played or not. Only the entrance keyframes count: a drag's transform
 * transition or a row that pulses endlessly is no part of it.
 */
const entrancesIn = (root: HTMLElement | null): Animation[] =>
  [...(root?.querySelectorAll(ENTRANCE_SELECTOR) ?? [])]
    .flatMap((element) => element.getAnimations())
    .filter(
      (animation) =>
        'animationName' in animation &&
        ENTRANCE_ANIMATIONS.includes(String(animation.animationName)) &&
        animation.effect?.getComputedTiming().endTime !== Infinity
    )

/**
 * `isEntering` is true from `enter()` until the rows under `root` have finished their entrance.
 * Not a timer from the mount: after a page change the browser holds the new page behind the View
 * Transition's old snapshot, and the animations only start once it shows. A fixed window ran out
 * during that hold and stripped the class from rows still on their way in. Rows that arrive
 * later (a new batch, a row moved to another group) are not waited for: they only fade.
 * `replay()` plays the rows' entrance again from its start, with the delays they carry by then.
 */
export const useStaggerEntrance = (root: MaybeRefOrGetter<HTMLElement | null>) => {
  const isEntering = ref(false)
  let entrance = 0

  const play = async (isReplay: boolean) => {
    const current = ++entrance
    isEntering.value = true
    await nextTick()
    const entrances = entrancesIn(toValue(root))
    if (isReplay) for (const animation of entrances) animation.currentTime = 0
    const running = entrances.filter((animation) => animation.playState !== 'finished')
    let timer = 0
    // A row removed mid-way cancels its animation; that ends its part as well.
    await Promise.race([
      Promise.allSettled(running.map((animation) => animation.finished)),
      new Promise((resolve) => {
        timer = window.setTimeout(resolve, MAX_ENTRANCE_MS)
      })
    ])
    window.clearTimeout(timer)
    if (current === entrance) isEntering.value = false
  }

  return { isEntering, enter: () => play(false), replay: () => play(true) }
}
