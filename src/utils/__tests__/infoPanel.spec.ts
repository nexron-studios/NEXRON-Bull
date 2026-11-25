import { describe, expect, it } from 'vitest'
import { hasInfoPanelRoom, infoPanelMaxWidth } from '../infoPanel'

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
