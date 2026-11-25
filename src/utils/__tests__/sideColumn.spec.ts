import { describe, expect, it } from 'vitest'
import {
  clampColumnWidth,
  columnSizeAtDrag,
  columnWidthAfterKey,
  parseStoredWidth
} from '../sideColumn'

const MIN = 280

describe('clampColumnWidth', () => {
  it('should hold the minimum', () => {
    expect(clampColumnWidth(200, MIN, 560)).toBe(280)
  })

  it('should round to whole pixels', () => {
    expect(clampColumnWidth(412.6, MIN, 560)).toBe(413)
  })

  it('should not grow past what the window allows', () => {
    expect(clampColumnWidth(700, MIN, 360)).toBe(360)
  })
})

describe('columnSizeAtDrag', () => {
  it('should follow the pointer between the minimum and the widest width', () => {
    expect(columnSizeAtDrag(412.4, MIN, 640)).toEqual({ isOpen: true, width: 412 })
  })

  it('should snap onto the minimum close to it', () => {
    expect(columnSizeAtDrag(250, MIN, 640)).toEqual({ isOpen: true, width: 280 })
  })

  it('should shut more than 40 px below the minimum', () => {
    expect(columnSizeAtDrag(239, MIN, 640)).toEqual({ isOpen: false })
  })

  it('should shut with the pointer at the window edge', () => {
    expect(columnSizeAtDrag(-30, MIN, 640)).toEqual({ isOpen: false })
  })

  it('should snap onto the widest width close to it and past it', () => {
    expect([columnSizeAtDrag(620, MIN, 640), columnSizeAtDrag(1500, MIN, 640)]).toEqual([
      { isOpen: true, width: 640 },
      { isOpen: true, width: 640 }
    ])
  })
})

describe('columnWidthAfterKey', () => {
  it('should widen with the left arrow', () => {
    expect(columnWidthAfterKey('ArrowLeft', false, 304, MIN, 560)).toBe(320)
  })

  it('should narrow by a large step with Shift and the right arrow', () => {
    expect(columnWidthAfterKey('ArrowRight', true, 400, MIN, 560)).toBe(336)
  })

  it('should jump to the minimum with Home and the widest width with End', () => {
    expect([
      columnWidthAfterKey('Home', false, 400, MIN, 640),
      columnWidthAfterKey('End', false, 400, MIN, 640)
    ]).toEqual([280, 640])
  })

  it('should ignore other keys', () => {
    expect(columnWidthAfterKey('Enter', false, 304, MIN, 560)).toBeNull()
  })
})

describe('parseStoredWidth', () => {
  it('should read a stored number', () => {
    expect(parseStoredWidth('612')).toBe(612)
  })

  it('should treat anything else as never set', () => {
    expect([parseStoredWidth('null'), parseStoredWidth('wide')]).toEqual([null, null])
  })
})
