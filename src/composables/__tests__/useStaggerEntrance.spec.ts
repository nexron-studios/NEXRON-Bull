import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStaggerEntrance } from '../useStaggerEntrance'

/** jsdom runs no animations: each row gets one whose end the test decides. */
const animateRow = (row: Element, { endTime = 200, animationName = 'motion-enter' } = {}) => {
  const animation = {
    animationName,
    currentTime: 120 as number | null,
    playState: 'running',
    finished: Promise.resolve(),
    effect: { getComputedTiming: () => ({ endTime }) }
  }
  let finish = () => {}
  animation.finished = new Promise<void>((resolve) => {
    finish = () => {
      animation.playState = 'finished'
      resolve()
    }
  })
  Object.defineProperty(row, 'getAnimations', { configurable: true, value: () => [animation] })
  return finish
}

const listWith = (...classes: string[]) => {
  const list = document.createElement('ul')
  for (const name of classes) {
    const row = document.createElement('li')
    row.className = name
    list.append(row)
  }
  document.body.append(list)
  return list
}

/** Lets the awaited `finished` promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve))

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('useStaggerEntrance', () => {
  it('should stay entering while a row is still on its way in', async () => {
    const list = listWith('motion-stagger', 'motion-stagger')
    animateRow(list.children[0])()
    const finishSecond = animateRow(list.children[1])
    const { isEntering, enter } = useStaggerEntrance(list)

    const entering = enter()
    await settle()
    const whileRunning = isEntering.value
    finishSecond()
    await entering

    expect([whileRunning, isEntering.value]).toEqual([true, false])
  })

  it('should end once every row has finished its entrance', async () => {
    const list = listWith('motion-stagger', 'motion-fade-in')
    const finishFirst = animateRow(list.children[0])
    const finishSecond = animateRow(list.children[1], { animationName: 'motion-fade-in' })
    const { isEntering, enter } = useStaggerEntrance(list)

    const entering = enter()
    finishFirst()
    finishSecond()
    await entering

    expect(isEntering.value).toBe(false)
  })

  it('should not wait for a row that arrives after the entrance began', async () => {
    const list = listWith('motion-stagger')
    const finishFirst = animateRow(list.children[0])
    const { isEntering, enter } = useStaggerEntrance(list)
    const entering = enter()
    await nextTick()
    const late = document.createElement('li')
    late.className = 'motion-stagger'
    list.append(late)
    animateRow(late)

    finishFirst()
    await entering

    expect(isEntering.value).toBe(false)
  })

  it('should not wait for an endless animation', async () => {
    const list = listWith('motion-stagger')
    animateRow(list.children[0], { endTime: Infinity })
    const { isEntering, enter } = useStaggerEntrance(list)

    await enter()

    expect(isEntering.value).toBe(false)
  })

  it('should not wait for an animation that is no entrance, like a drag', async () => {
    const list = listWith('motion-stagger')
    animateRow(list.children[0], { animationName: 'drag-settle' })
    const { isEntering, enter } = useStaggerEntrance(list)

    await enter()

    expect(isEntering.value).toBe(false)
  })

  it('should end after two seconds at the latest when the animations stall', async () => {
    vi.useFakeTimers()
    const list = listWith('motion-stagger')
    animateRow(list.children[0])
    const { isEntering, enter } = useStaggerEntrance(list)

    const entering = enter()
    await vi.advanceTimersByTimeAsync(2000)
    await entering

    expect(isEntering.value).toBe(false)
  })

  it('should keep entering when a new entrance starts before the first ends', async () => {
    const list = listWith('motion-stagger')
    const finishFirst = animateRow(list.children[0])
    const { isEntering, enter } = useStaggerEntrance(list)
    const first = enter()
    await nextTick()
    const finishSecond = animateRow(list.children[0])

    const second = enter()
    finishFirst()
    await first
    const afterFirst = isEntering.value
    finishSecond()
    await second

    expect([afterFirst, isEntering.value]).toEqual([true, false])
  })

  it('should play a row that already entered again from its start on replay', async () => {
    const list = listWith('motion-stagger')
    animateRow(list.children[0])()
    const [animation] = list.children[0].getAnimations()
    const { replay } = useStaggerEntrance(list)

    await replay()

    expect(animation.currentTime).toBe(0)
  })
})
