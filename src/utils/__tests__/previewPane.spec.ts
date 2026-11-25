import { describe, expect, it } from 'vitest'
import { hasPreviewRoom, previewMaxWidth, previewShownAs, previewWidthOf } from '../previewPane'

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

describe('previewWidthOf', () => {
  it('should leave the chat its roomy width until the edge is dragged', () => {
    expect([previewWidthOf(null, 480), previewWidthOf(null, 1000)]).toEqual([400, 560])
  })

  it('should not go below the minimum for the roomy width', () => {
    expect(previewWidthOf(null, 400)).toBe(360)
  })

  it('should hold a dragged width inside minimum and maximum', () => {
    expect([previewWidthOf(100, 1000), previewWidthOf(2000, 1000)]).toEqual([360, 1000])
  })
})

describe('previewShownAs', () => {
  it('should show the open pane where it fits', () => {
    expect([previewShownAs(true, true, false), previewShownAs(true, false, true)]).toEqual([
      'pane',
      'none'
    ])
  })

  it('should show the sheet only where no pane fits and it was asked for', () => {
    expect([previewShownAs(false, true, true), previewShownAs(false, true, false)]).toEqual([
      'sheet',
      'none'
    ])
  })
})
