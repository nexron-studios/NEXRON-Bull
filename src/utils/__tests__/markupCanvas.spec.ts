import { describe, expect, it } from 'vitest'
import { drawStrokes } from '../markupCanvas'
import { anchorOf, type LineStroke, type LineTool, type Stroke } from '../markup'

// Records what a 2D context is asked to do, in order, including the style at each stroke().
// Rounded, so float noise in the arrow head does not leak into the expectations.
const round = (value: number) => Math.round(value * 100) / 100

const recorder = () => {
  const calls: string[] = []
  const ctx = {
    globalAlpha: 1,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
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
    arc: (x: number, y: number, radius: number) => calls.push(`arc ${x},${y} r${radius}`),
    fill: () => calls.push(`fill ${String(ctx.fillStyle)}`),
    strokeText: (text: string, x: number, y: number) => calls.push(`outline "${text}" ${x},${y}`),
    fillText: (text: string, x: number, y: number) =>
      calls.push(`text "${text}" ${x},${y} ${String(ctx.fillStyle)} ${ctx.font}`),
    save: () => calls.push('save'),
    restore: () => {
      calls.push('restore')
      ctx.globalAlpha = 1
    }
  }
  return { ctx, calls }
}

const stroke = (
  tool: LineTool,
  points: [number, number][],
  width = 2,
  id: string = tool
): LineStroke => ({
  id,
  tool,
  color: 'red',
  badge: 10,
  anchor: anchorOf(
    tool,
    points.map(([x, y]) => ({ x, y }))
  ),
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

describe('drawStrokes with numbers', () => {
  const frame = stroke('rect', [
    [40, 60],
    [10, 20]
  ])
  const pin: Stroke = {
    id: 'pin',
    tool: 'pin',
    color: 'blue',
    badge: 8,
    anchor: { x: 5, y: 6 },
    points: [{ x: 5, y: 6 }]
  }

  it('should put the number of a frame on its top-left corner', () => {
    const { ctx, calls } = recorder()

    drawStrokes(ctx, [frame], new Map([['rect', 1]]))

    expect(calls).toContain('arc 10,20 r10')
    expect(calls).toContain('fill red')
    expect(calls.at(-2)).toBe('text "1" 10,20 white 700 11px system-ui, sans-serif')
  })

  it('should leave a mark without a number unbadged', () => {
    const { ctx, calls } = recorder()

    drawStrokes(ctx, [frame])

    expect(calls.some((call) => call.startsWith('arc'))).toBe(false)
  })

  it('should draw a pin only as its badge', () => {
    const { ctx, calls } = recorder()

    drawStrokes(ctx, [pin], new Map([['pin', 2]]))

    expect(calls.filter((call) => call.startsWith('arc') || call.startsWith('text'))).toEqual([
      'arc 5,6 r8',
      'text "2" 5,6 white 700 8.8px system-ui, sans-serif'
    ])
  })

  it('should badge a mark the eraser cut in pieces once, at its first piece', () => {
    const { ctx, calls } = recorder()
    const first = stroke('pen', [[0, 0]], 2, 'cut')
    const second = stroke('pen', [[50, 50]], 2, 'cut')

    drawStrokes(ctx, [first, second], new Map([['cut', 1]]))

    expect(calls.filter((call) => call.startsWith('arc'))).toEqual(['arc 0,0 r10'])
  })

  it('should keep a badge where the mark was made, even when its piece starts elsewhere', () => {
    const { ctx, calls } = recorder()
    const piece = { ...stroke('pen', [[30, 40]], 2, 'rect'), anchor: { x: 10, y: 20 } }

    drawStrokes(ctx, [piece], new Map([['rect', 1]]))

    expect(calls).toContain('arc 10,20 r10')
  })

  it('should paint the badges after every line, so no line covers a number', () => {
    const { ctx, calls } = recorder()
    const later = stroke('pen', [[1, 1]], 2, 'later')

    drawStrokes(ctx, [frame, later], new Map([['rect', 1]]))

    expect(calls.indexOf('arc 10,20 r10')).toBeGreaterThan(calls.indexOf('move 1,1'))
  })

  it('should write a text in its colour with a dark edge, top left at its point', () => {
    const { ctx, calls } = recorder()
    const text: Stroke = {
      id: 'text',
      tool: 'text',
      color: 'green',
      badge: 10,
      anchor: { x: 3, y: 4 },
      size: 20,
      textWidth: 70,
      text: 'zu groß',
      points: [{ x: 3, y: 4 }]
    }

    drawStrokes(ctx, [text])

    expect(calls.filter((call) => call.includes('"zu groß"'))).toEqual([
      'outline "zu groß" 3,4',
      'text "zu groß" 3,4 green 600 20px system-ui, sans-serif'
    ])
  })
})
