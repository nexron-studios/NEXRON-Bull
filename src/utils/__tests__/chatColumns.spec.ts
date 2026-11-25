import { describe, expect, it } from 'vitest'
import { columnWidthsOf, type ChatColumnsInput } from '../chatColumns'

const LAPTOP: ChatColumnsInput = {
  windowWidth: 1280,
  sidebarWidth: 320,
  hasChat: true,
  panel: { isOpen: true, width: null },
  preview: { isOpen: true, width: null }
}

describe('columnWidthsOf', () => {
  it('should keep the open panel and let the preview give way where both do not fit', () => {
    const { panel, preview } = columnWidthsOf(LAPTOP)
    expect([panel.isShown, panel.width, preview.canShow, preview.isShown]).toEqual([
      true,
      304,
      false,
      false
    ])
  })

  it('should give the preview its roomy width while the panel is shut', () => {
    const { panel, preview } = columnWidthsOf({ ...LAPTOP, panel: { isOpen: false, width: null } })
    expect([panel.canShow, preview.isShown, preview.width]).toEqual([true, true, 400])
  })

  it('should fit both in a wide window, the panel in what the preview leaves', () => {
    const { panel, preview } = columnWidthsOf({
      ...LAPTOP,
      windowWidth: 1800,
      panel: { isOpen: true, width: 600 }
    })
    expect([preview.width, preview.maxWidth, panel.width, panel.maxWidth]).toEqual([
      560, 720, 440, 440
    ])
  })

  it('should show neither without a chat', () => {
    const { panel, preview } = columnWidthsOf({ ...LAPTOP, windowWidth: 1800, hasChat: false })
    expect([panel.canShow, preview.canShow]).toEqual([false, false])
  })
})
