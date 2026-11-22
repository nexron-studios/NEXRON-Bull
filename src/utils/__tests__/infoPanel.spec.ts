import { describe, expect, it } from 'vitest'
import {
  clampInfoPanelWidth,
  hasInfoPanelRoom,
  infoPanelMaxWidth,
  infoPanelSizeAtDrag,
  infoPanelWidthAfterKey,
  parseInfoPanelWidth
} from '../infoPanel'

describe('hasInfoPanelRoom', () => {
  it('should show the panel in a wide window with a normal sidebar', () => {
    expect(hasInfoPanelRoom(1440, 320)).toBe(true)
  })

  it('should hide it below 1100 px, even with the sidebar folded', () => {
    expect(hasInfoPanelRoom(1099, 56)).toBe(false)
  })

  it('should still show it at its narrowest next to a wide sidebar', () => {
    expect(hasInfoPanelRoom(1440, 680)).toBe(true)
  })

  it('should hide it once the sidebar leaves the chat too little beside it', () => {
    expect(hasInfoPanelRoom(1440, 681)).toBe(false)
  })
})

describe('infoPanelMaxWidth', () => {
  it('should grow until the chat keeps its minimum in a wide window', () => {
    expect(infoPanelMaxWidth(2560, 320)).toBe(1760)
  })

  it('should leave the chat its minimum next to a wide sidebar', () => {
    expect(infoPanelMaxWidth(1440, 600)).toBe(360)
  })
})

describe('parseInfoPanelWidth', () => {
  it('should keep a stored number', () => {
    expect(parseInfoPanelWidth(412)).toBe(412)
  })

  it('should fall back to the default for a value that is no number', () => {
    expect(parseInfoPanelWidth(Number.NaN)).toBe(304)
  })
})

describe('clampInfoPanelWidth', () => {
  it('should raise a width below the minimum', () => {
    expect(clampInfoPanelWidth(200, 560)).toBe(280)
  })

  it('should round a dragged width to whole pixels', () => {
    expect(clampInfoPanelWidth(412.6, 560)).toBe(413)
  })

  it('should cap a width at the given maximum', () => {
    expect(clampInfoPanelWidth(700, 360)).toBe(360)
  })
})

describe('infoPanelSizeAtDrag', () => {
  it('should follow the pointer between the minimum and the widest width', () => {
    expect(infoPanelSizeAtDrag(412.4, 640)).toEqual({ isOpen: true, width: 412 })
  })

  it('should snap onto the minimum close to it', () => {
    expect(infoPanelSizeAtDrag(250, 640)).toEqual({ isOpen: true, width: 280 })
  })

  it('should shut below 240 px', () => {
    expect(infoPanelSizeAtDrag(239, 640)).toEqual({ isOpen: false })
  })

  it('should shut with the pointer at the window edge', () => {
    expect(infoPanelSizeAtDrag(-30, 640)).toEqual({ isOpen: false })
  })

  it('should snap onto the widest width close to it and past it', () => {
    expect([infoPanelSizeAtDrag(620, 640), infoPanelSizeAtDrag(1500, 640)]).toEqual([
      { isOpen: true, width: 640 },
      { isOpen: true, width: 640 }
    ])
  })
})

describe('infoPanelWidthAfterKey', () => {
  it('should widen with the left arrow', () => {
    expect(infoPanelWidthAfterKey('ArrowLeft', false, 304, 560)).toBe(320)
  })

  it('should narrow by a large step with Shift and the right arrow', () => {
    expect(infoPanelWidthAfterKey('ArrowRight', true, 400, 560)).toBe(336)
  })

  it('should jump to the minimum with Home', () => {
    expect(infoPanelWidthAfterKey('Home', false, 400, 560)).toBe(280)
  })

  it('should jump to the widest width this window allows with End', () => {
    expect(infoPanelWidthAfterKey('End', false, 400, 640)).toBe(640)
  })

  it('should ignore other keys', () => {
    expect(infoPanelWidthAfterKey('Enter', false, 304, 560)).toBeNull()
  })
})
