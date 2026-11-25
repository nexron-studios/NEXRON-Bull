import { describe, expect, it } from 'vitest'
import {
  appendedKeys,
  isAnimatedOnArrival,
  isSameMarkerBox,
  layoutLeftOf,
  markerGlideOf,
  springStepOf,
  tabDirectionOf
} from '../motion'
import type { StreamItem } from '../chatStream'
import type { ChatMessage } from '@/types/agentd.type'

const message = (role: 'user' | 'assistant'): ChatMessage => ({
  uuid: 'm',
  role,
  at: null,
  blocks: []
})

describe('tabDirectionOf', () => {
  it('should go next when the new tab sits to the right', () => {
    expect(tabDirectionOf(['a', 'b', 'c'], 'a', 'c')).toBe('next')
  })

  it('should go prev when the new tab sits to the left', () => {
    expect(tabDirectionOf(['a', 'b', 'c'], 'c', 'b')).toBe('prev')
  })

  it('should go next after the old tab was closed', () => {
    expect(tabDirectionOf(['a', 'c'], 'b', 'a')).toBe('next')
  })
})

describe('appendedKeys', () => {
  it('should return keys added behind the last one', () => {
    expect(appendedKeys(['a', 'b'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'd'])
  })

  it('should ignore the first fill of an empty pane', () => {
    expect(appendedKeys([], ['a', 'b'])).toEqual([])
  })

  it('should ignore older history put in front', () => {
    expect(appendedKeys(['c', 'd'], ['a', 'b', 'c', 'd'])).toEqual([])
  })

  it('should ignore a list the last key is no longer part of', () => {
    expect(appendedKeys(['a', 'b'], ['x', 'y'])).toEqual([])
  })
})

describe('isAnimatedOnArrival', () => {
  it('should animate the user prompt', () => {
    const item: StreamItem = { kind: 'message', key: 'm', message: message('user') }
    expect(isAnimatedOnArrival(item)).toBe(true)
  })

  it('should not animate Claude text that replaces the streamed one', () => {
    const item: StreamItem = { kind: 'message', key: 'm', message: message('assistant') }
    expect(isAnimatedOnArrival(item)).toBe(false)
  })

  it('should not animate finished reasoning', () => {
    const item: StreamItem = { kind: 'reasoning', key: 'r', reasoning: { text: '', seconds: 1 } }
    expect(isAnimatedOnArrival(item)).toBe(false)
  })

  it('should animate a new run of reads', () => {
    const item: StreamItem = { kind: 'reads', key: 'r', steps: [], isCurrent: true }
    expect(isAnimatedOnArrival(item)).toBe(true)
  })
})

describe('markerGlideOf', () => {
  it('should start at the old box and end at the new one', () => {
    expect(markerGlideOf({ x: 2, width: 40 }, { x: 42, width: 80 })).toEqual([
      { transform: 'translateX(2px) scaleX(0.5)' },
      { transform: 'translateX(42px) scaleX(1)' }
    ])
  })

  it('should not glide before the first box is known', () => {
    expect(markerGlideOf(null, { x: 42, width: 80 })).toBeNull()
  })

  it('should not glide when the box stays where it is', () => {
    expect(markerGlideOf({ x: 42, width: 80 }, { x: 42, width: 80 })).toBeNull()
  })

  it('should not glide from or to a hidden choice of zero width', () => {
    expect(markerGlideOf({ x: 0, width: 0 }, { x: 42, width: 80 })).toBeNull()
  })
})

describe('isSameMarkerBox', () => {
  it('should count float noise as the same box', () => {
    expect(isSameMarkerBox({ x: 40, width: 80 }, { x: 40.000001, width: 79.999999 })).toBe(true)
  })

  it('should count a tenth of a pixel as a new box', () => {
    expect(isSameMarkerBox({ x: 40, width: 80 }, { x: 40.1, width: 80 })).toBe(false)
  })

  it('should count no box as the same only as no box', () => {
    expect(isSameMarkerBox(null, null)).toBe(true)
    expect(isSameMarkerBox(null, { x: 40, width: 80 })).toBe(false)
  })
})

describe('layoutLeftOf', () => {
  it('should be the drawn edge of an element without a transform', () => {
    expect(layoutLeftOf({ drawnLeft: 40.5, shift: 0, scale: 1, origin: 50 })).toBe(40.5)
  })

  it('should take out a slide', () => {
    expect(layoutLeftOf({ drawnLeft: 52, shift: 12, scale: 1, origin: 0 })).toBe(40)
  })

  it('should take out a scale around the centre', () => {
    expect(layoutLeftOf({ drawnLeft: 45, shift: 0, scale: 0.9, origin: 50 })).toBeCloseTo(40)
  })

  it('should take out a glide scaled from the left edge', () => {
    expect(layoutLeftOf({ drawnLeft: 132, shift: 132, scale: 0.5, origin: 0 })).toBe(0)
  })
})

describe('springStepOf', () => {
  it('should cover 98 % of the way in 280 ms like the smooth spring token', () => {
    const { offset } = springStepOf({ offset: -100, velocity: 0 }, 280)
    expect(offset).toBeCloseTo(-1.95, 1)
  })

  it('should keep the speed it has when the target moves', () => {
    const moving = springStepOf({ offset: -100, velocity: 500 }, 16)
    const resting = springStepOf({ offset: -100, velocity: 0 }, 16)
    expect(moving.offset - resting.offset).toBeCloseTo(5.72, 1)
  })

  it('should stay put for a step of no time', () => {
    expect(springStepOf({ offset: -40, velocity: 120 }, 0)).toEqual({ offset: -40, velocity: 120 })
  })
})
