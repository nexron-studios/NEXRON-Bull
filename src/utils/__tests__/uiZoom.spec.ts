import { describe, expect, it } from 'vitest'
import { autoUiZoomOf, nextUiZoomOf, uiZoomChoiceOf } from '../uiZoom'

describe('autoUiZoomOf', () => {
  it('should stay at 100 % up to a 1920×1080 window and below it', () => {
    expect([autoUiZoomOf(1280, 820), autoUiZoomOf(1920, 1040), autoUiZoomOf(2100, 1180)]).toEqual([
      1, 1, 1
    ])
  })

  it('should grow with the window to 150 % on a 4K screen at 100 % system scaling', () => {
    expect([autoUiZoomOf(2200, 1240), autoUiZoomOf(2560, 1400), autoUiZoomOf(3840, 2100)]).toEqual([
      1.1, 1.25, 1.5
    ])
  })

  it('should let the shorter side decide for a wide but low window', () => {
    expect(autoUiZoomOf(3840, 1080)).toBe(1)
  })
})

describe('nextUiZoomOf', () => {
  it('should move one step and stay at either end', () => {
    expect([
      nextUiZoomOf(1, 1),
      nextUiZoomOf(1.25, -1),
      nextUiZoomOf(1.5, 1),
      nextUiZoomOf(0.9, -1)
    ]).toEqual([1.1, 1.1, 1.5, 0.9])
  })
})

describe('uiZoomChoiceOf', () => {
  it('should keep auto and the known steps', () => {
    expect([uiZoomChoiceOf('auto'), uiZoomChoiceOf(1.25)]).toEqual(['auto', 1.25])
  })

  it('should fall back to auto for anything else', () => {
    expect([uiZoomChoiceOf(1.3), uiZoomChoiceOf('1.25'), uiZoomChoiceOf(null)]).toEqual([
      'auto',
      'auto',
      'auto'
    ])
  })
})
