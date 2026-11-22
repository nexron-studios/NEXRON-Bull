import { describe, expect, it } from 'vitest'
import { panelWidthIn, parseSidebarLayout, sizeAfterKey, sizeAtPointer } from '../sidebarLayout'

const WINDOW = 1440

describe('sizeAtPointer', () => {
  it('should follow the pointer between the minimum and the widest panel', () => {
    expect(sizeAtPointer(412.4, WINDOW, 320)).toEqual({ layout: 'panel', width: 412 })
  })

  it('should snap onto the minimum close to it and a little below it', () => {
    expect([sizeAtPointer(255, WINDOW, 320), sizeAtPointer(210, WINDOW, 320)]).toEqual([
      { layout: 'panel', width: 240 },
      { layout: 'panel', width: 240 }
    ])
  })

  it('should fold into the rail well below the minimum, keeping the panel width', () => {
    expect(sizeAtPointer(150, WINDOW, 380)).toEqual({ layout: 'rail', width: 380 })
  })

  it('should open the rail again once dragged past the fold point', () => {
    expect(sizeAtPointer(205, WINDOW, 380)).toEqual({ layout: 'panel', width: 240 })
  })

  it('should take the full width once the chat would get too narrow, keeping the panel width', () => {
    expect(sizeAtPointer(1400, WINDOW, 380)).toEqual({ layout: 'full', width: 380 })
  })

  it('should snap onto the widest panel close below it', () => {
    expect(sizeAtPointer(460, WINDOW, 320)).toEqual({ layout: 'panel', width: 480 })
  })

  it('should stay at the widest panel until the chat would get too narrow', () => {
    expect([sizeAtPointer(800, WINDOW, 320), sizeAtPointer(1140, WINDOW, 320)]).toEqual([
      { layout: 'panel', width: 480 },
      { layout: 'panel', width: 480 }
    ])
  })

  it('should leave the chat its minimum when the window is narrower than the cap allows', () => {
    expect([sizeAtPointer(430, 760, 320), sizeAtPointer(470, 760, 320)]).toEqual([
      { layout: 'panel', width: 440 },
      { layout: 'full', width: 320 }
    ])
  })
})

describe('sizeAfterKey', () => {
  it('should step the panel without snapping at the minimum', () => {
    expect(sizeAfterKey('ArrowRight', false, { layout: 'panel', width: 240 }, WINDOW)).toEqual({
      layout: 'panel',
      width: 256
    })
  })

  it('should take larger steps with shift and stop at the minimum', () => {
    expect(sizeAfterKey('ArrowLeft', true, { layout: 'panel', width: 280 }, WINDOW)).toEqual({
      layout: 'panel',
      width: 240
    })
  })

  it('should stay at the cap on a wide window and come back from full width to it', () => {
    const widest = { layout: 'panel', width: 480 } as const
    expect([
      sizeAfterKey('ArrowRight', false, widest, WINDOW),
      sizeAfterKey('ArrowLeft', false, { layout: 'full', width: 320 }, WINDOW)
    ]).toEqual([null, { layout: 'panel', width: 480 }])
  })

  it('should go to full width from the widest panel when the chat limits it', () => {
    const widest = { layout: 'panel', width: 440 } as const
    expect(sizeAfterKey('ArrowRight', false, widest, 760)).toEqual({ layout: 'full', width: 440 })
  })

  it('should open the rail to the minimum and keep it a rail on left and home', () => {
    const rail = { layout: 'rail', width: 400 } as const
    expect([
      sizeAfterKey('ArrowRight', false, rail, WINDOW),
      sizeAfterKey('a', false, rail, WINDOW),
      sizeAfterKey('ArrowLeft', false, rail, WINDOW),
      sizeAfterKey('Home', false, rail, WINDOW)
    ]).toEqual([{ layout: 'panel', width: 240 }, null, null, null])
  })
})

describe('panelWidthIn', () => {
  it('should shrink a stored width to what a smaller window allows', () => {
    expect(panelWidthIn(450, 600)).toBe(280)
  })

  it('should cap a width stored before the cap existed', () => {
    expect(panelWidthIn(1170, 2500)).toBe(480)
  })
})

describe('parseSidebarLayout', () => {
  it('should fall back to the panel for unknown values', () => {
    expect([
      parseSidebarLayout('rail'),
      parseSidebarLayout('wide'),
      parseSidebarLayout(null)
    ]).toEqual(['rail', 'panel', 'panel'])
  })
})
