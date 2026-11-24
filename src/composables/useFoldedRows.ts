import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useStorage } from '@vueuse/core'

/** Rows a folded panel list shows before "Mehr anzeigen". */
export const FOLDED_ROWS = 5

/**
 * The first rows of a panel list and the rest behind "Mehr anzeigen" (21.11.2026), shut again with
 * "Weniger anzeigen". Open or shut is stored under `storageKey` and holds for every chat, so
 * switching tabs keeps the section's height; without a key it holds for this list only (the
 * actions of one subagent). A single hidden row is shown instead: the button would take its room.
 */
export const useFoldedRows = <T>(rows: MaybeRefOrGetter<readonly T[]>, storageKey?: string) => {
  const isExpanded = storageKey ? useStorage(storageKey, false) : ref(false)

  const isFoldable = computed(() => toValue(rows).length > FOLDED_ROWS + 1)
  const shown = computed(() =>
    isFoldable.value && !isExpanded.value ? toValue(rows).slice(0, FOLDED_ROWS) : toValue(rows)
  )
  const hiddenCount = computed(() => toValue(rows).length - FOLDED_ROWS)

  const toggle = () => {
    isExpanded.value = !isExpanded.value
  }

  return { shown, isFoldable, isExpanded, hiddenCount, toggle }
}
