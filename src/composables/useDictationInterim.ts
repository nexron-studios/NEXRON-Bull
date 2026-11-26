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

  const highlights = computed<Highlight[]>(() =>
    shown.value ? [{ ...interimRangeOf(shown.value), kind: 'interim' }] : []
  )

  /**
   * The draft as it was before the interim text. Returns where that text started, which is
   * where dictated words belong now even if the draft changed around them; null if none shown.
   */
  const takeOut = (): number | null => {
    if (!shown.value) return null
    const edit = withoutInserted(draft.value, shown.value)
    apply(edit)
    shown.value = null
    return edit.caret
  }

  /** `transcript` in place of the interim text shown before, else at `at`; empty shows nothing. */
  const show = (at: number, transcript: string) => {
    const from = takeOut() ?? at
    const { inserted, ...edit } = withInterim(draft.value, from, transcript)
    if (!inserted.text) return
    apply(edit)
    shown.value = inserted
  }

  return { highlights, show, takeOut }
}
