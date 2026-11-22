import { describe, expect, it } from 'vitest'
import { drawStrokes } from '../markupCanvas'
import type { Stroke } from '../markup'

// Records what a 2D context is asked to do, in order, including the style at each stroke().
// Rounded, so float noise in the arrow head does not leak into the expectations.
const round = (value: number) => Math.round(value * 100) / 100

const recorder = () => {
  const calls: string[] = []
  const ctx = {
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    beginPath: () => calls.push('begin'),
    moveTo: (x: number, y: number) => calls.push(`move ${round(x)},${round(y)}`),
    lineTo: (x: number, y: number) => calls.push(`line ${round(x)},${round(y)}`),
    stroke: () =>
      calls.push(`stroke ${String(ctx.strokeStyle)} ${ctx.lineWidth} ${ctx.globalAlpha}`),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      calls.push(`rect ${x},${y},${w},${h}`),
    save: () => calls.push('save'),
    restore: () => {
      calls.push('restore')
      ctx.globalAlpha = 1
    }
  }
  return { ctx, calls }
}

const stroke = (tool: Stroke['tool'], points: [number, number][], width = 2): Stroke => ({
  tool,
  color: 'red',
  width,
  points: points.map(([x, y]) => ({ x, y }))
})

describe('drawStrokes', () => {
  it('should trace a pen path from its first point', () => {
    const { ctx, calls } = recorder()

    drawStrokes(ctx, [
      stroke('pen', [
        [0, 0],
        [5, 5],
        [9, 2]
      ])
    ])

    expect(calls).toEqual([
      'save',
      'begin',
      'move 0,0',
      'line 5,5',
      'line 9,2',
      'stroke red 2 1',
      'restore'
    ])
  })

  it('should leave a dot for a single tap', () => {
    const { ctx, calls } = recorder()

    drawStrokes(ctx, [stroke('pen', [[3, 4]])])

    expect(calls).toEqual(['save', 'begin', 'move 3,4', 'line 3,4', 'stroke red 2 1', 'restore'])
  })

  it('should draw the highlighter see-through', () => {
    const { ctx, calls } = recorder()

    drawStrokes(ctx, [
      stroke('highlighter', [
        [0, 0],
        [1, 0]
      ])
    ])

    expect(calls).toContain('stroke red 2 0.35')
  })

  it('should draw a frame from start to end point', () => {
    const { ctx, calls } = recorder()

    drawStrokes(ctx, [
      stroke('rect', [
        [10, 20],
        [40, 60]
      ])
    ])

    expect(calls).toEqual(['save', 'begin', 'rect 10,20,30,40', 'stroke red 2 1', 'restore'])
  })

  it('should draw an arrow as shaft plus head, the head at least 12 px long', () => {
    const { ctx, calls } = recorder()

    drawStrokes(ctx, [
      stroke('arrow', [
        [0, 0],
        [100, 0]
      ])
    ])

    expect(calls.filter((call) => call.startsWith('move') || call.startsWith('line'))).toEqual([
      'move 0,0',
      'line 100,0',
      'move 89.61,-6',
      'line 100,0',
      'line 89.61,6'
    ])
  })
})
