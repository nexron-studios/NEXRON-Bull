import { ref } from 'vue'
import { defineStore } from 'pinia'

/** Long enough to catch from the corner of the eye, short enough to be gone before the next. */
const HINT_MS = 900

/** The small "Kopiert" next to the pointer after a selection was copied. `id` restarts it. */
export interface CopyHint {
  id: number
  x: number
  y: number
}

/**
 * Copy on select confirms quietly where the pointer let go (`NchCopyHint`), not with a toast: a
 * toast for every selection would pile up while reading and selecting.
 */
export const useCopyHintStore = defineStore('copyHint', () => {
  const hint = ref<CopyHint | null>(null)
  let hideTimer: ReturnType<typeof setTimeout> | undefined

  const show = (x: number, y: number) => {
    clearTimeout(hideTimer)
    hint.value = { id: (hint.value?.id ?? 0) + 1, x, y }
    hideTimer = setTimeout(() => {
      hint.value = null
    }, HINT_MS)
  }

  return { hint, show }
})
