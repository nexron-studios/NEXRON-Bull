import type { Ref } from 'vue'
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import { pauseSkipping, rearmSkipping } from '@/lib/skipOffscreen'

// A window drag changes the width every frame; skipping resumes once it held still this long.
const SETTLE_MS = 200

/**
 * Keeps `v-skip-offscreen` true to the width of a scroll area. A message skipped at the old width
 * would keep its old height and jump once scrolled to; a panel opening or the window being
 * resized lays every message out again at the new width, then skipping resumes.
 */
export const useSkipOffscreenWidth = (scroller: Ref<HTMLElement | null>) => {
  let width = 0
  const rearm = useDebounceFn(() => {
    if (scroller.value) rearmSkipping(scroller.value)
  }, SETTLE_MS)

  useResizeObserver(scroller, ([entry]) => {
    const next = entry.contentRect.width
    if (next === width) return
    const isFirst = width === 0
    width = next
    if (isFirst || !scroller.value) return
    pauseSkipping(scroller.value)
    void rearm()
  })
}
