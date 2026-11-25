import { effectScope, nextTick, ref, type MaybeRefOrGetter } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePreviewStore } from '@/stores/preview'
import { usePreviewPane } from '../usePreviewPane'

const SIDEBAR_WIDTH = 320
const NARROW_WINDOW = 900
const WIDE_WINDOW = 1600
const LAPTOP_WINDOW = 1280
const INFO_PANEL_RESERVE = 280

const pane = (windowWidth: MaybeRefOrGetter<number>, reservedWidth = 0) => {
  const scope = effectScope()
  const result = scope.run(() => usePreviewPane(windowWidth, SIDEBAR_WIDTH, true, reservedWidth))
  if (!result) throw new Error('usePreviewPane returned nothing')
  return result
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  localStorage.clear()
})

describe('usePreviewPane', () => {
  it('should keep the preview open beside the chat once a widened window has room again', async () => {
    const windowWidth = ref(NARROW_WINDOW)
    pane(windowWidth)
    const preview = usePreviewStore()
    preview.isSheetOpen = true

    windowWidth.value = WIDE_WINDOW
    await nextTick()

    expect([preview.isSheetOpen, preview.isOpen]).toEqual([false, true])
  })

  it('should give way to the open info panel instead of hiding it', () => {
    expect([
      pane(LAPTOP_WINDOW).canShow.value,
      pane(LAPTOP_WINDOW, INFO_PANEL_RESERVE).canShow.value
    ]).toEqual([true, false])
  })

  it('should leave the chat its roomy width before the edge was dragged', () => {
    expect(pane(LAPTOP_WINDOW).width.value).toBe(400)
  })
})
