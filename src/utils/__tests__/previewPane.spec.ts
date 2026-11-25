import { describe, expect, it } from 'vitest'
import {
  clampPreviewWidth,
  hasPreviewRoom,
  previewMaxWidth,
  previewSizeAtDrag,
  previewWidthAfterKey
} from '../previewPane'

describe('hasPreviewRoom', () => {
  it('should fit beside the chat in a normal window', () => {
    expect(hasPreviewRoom(1280, 320)).toBe(true)
  })

  it('should give way once the chat would keep less than its minimum', () => {
    expect(hasPreviewRoom(1280, 441)).toBe(false)
  })
})

describe('previewMaxWidth', () => {
  it('should leave the chat its minimum', () => {
    expect(previewMaxWidth(1800, 320)).toBe(1000)
  })
})

describe('clampPreviewWidth', () => {
  it('should fall back to the default for a stored value that is no number', () => {
    expect(clampPreviewWidth('wide', 1000)).toBe(560)
  })

  it('should leave the chat its roomy width until the edge is dragged', () => {
    expect([clampPreviewWidth(null, 480), clampPreviewWidth(null, 1000)]).toEqual([400, 560])
  })

  it('should not go below the minimum for the roomy width', () => {
    expect(clampPreviewWidth(null, 400)).toBe(360)
  })

  it('should hold a width inside minimum and maximum', () => {
    expect([clampPreviewWidth(100, 1000), clampPreviewWidth(2000, 1000)]).toEqual([360, 1000])
  })
})

describe('previewSizeAtDrag', () => {
  it('should shut the pane when dragged well below its minimum', () => {
    expect(previewSizeAtDrag(300, 1000)).toEqual({ isOpen: false })
  })

  it('should keep a width in between', () => {
    expect(previewSizeAtDrag(600.4, 1000)).toEqual({ isOpen: true, width: 600 })
  })
})

describe('previewWidthAfterKey', () => {
  it('should widen with the left arrow and jump to the ends with Home and End', () => {
    expect([
      previewWidthAfterKey('ArrowLeft', false, 500, 1000),
      previewWidthAfterKey('Home', false, 500, 1000),
      previewWidthAfterKey('End', false, 500, 1000),
      previewWidthAfterKey('a', false, 500, 1000)
    ]).toEqual([516, 360, 1000, null])
  })
})
