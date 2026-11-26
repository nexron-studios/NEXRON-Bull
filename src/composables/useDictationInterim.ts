import { computed, ref, type Ref } from 'vue'
import {
  interimRangeOf,
  withInterim,
  withoutInserted,
  type Inserted,
  type TextEdit
} from '@/utils/dictation'
import type { Highlight } from '@/utils/textPieces'

/**
 * What Claude recognised so far while Space is held, shown in the draft where the transcript
 * will land (`useSpaceDictation`). It is in the draft only for the time being: each update and
 * the final transcript take it out first, and so does every way a dictation ends without one.
 * The draft is written programmatically, so none of it lands in the field's undo history.
 */
export const useDictationInterim = (draft: Ref<string>, apply: (edit: TextEdit) => void) => {
  const shown = ref<Inserted | null>(null)

  const isShown = computed(() => shown.value !== null)
  const highlights = computed<Highlight[]>(() =>
    shown.value ? [{ ...interimRangeOf(shown.value), kind: 'interim' }] : []
  )

  /** The draft as it was before the interim text, caret where that text started. */
  const takeOut = () => {
    if (!shown.value) return
    apply(withoutInserted(draft.value, shown.value))
    shown.value = null
  }

  /** `transcript` at `at` in place of the interim text shown before; empty shows nothing. */
  const show = (at: number, transcript: string) => {
    takeOut()
    const { inserted, ...edit } = withInterim(draft.value, at, transcript)
    if (!inserted.text) return
    apply(edit)
    shown.value = inserted
  }

  return { isShown, highlights, show, takeOut }
}
