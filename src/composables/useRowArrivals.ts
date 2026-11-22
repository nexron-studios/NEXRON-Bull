import { computed, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'

/**
 * Which rows of a list arrive while you look, and their place in the stagger. The info panel
 * mounts again for every chat tab; when every row played its entrance there, switching tabs looked
 * like the lists loading again (21.11.2026). Rows already there at mount show at once,
 * unless `isEntering` says the whole list is new (a sheet that just opened). Arrivals count from
 * zero, so a late row does not wait behind rows that are already there.
 */
export const useRowArrivals = (keys: MaybeRefOrGetter<readonly string[]>, isEntering = false) => {
  const known = shallowRef(new Set(isEntering ? [] : toValue(keys)))

  const arrivals = computed(() => toValue(keys).filter((key) => !known.value.has(key)))

  /** `null` for a row that was there before: it gets no entrance. */
  const staggerIndexOf = (key: string): number | null => {
    const index = arrivals.value.indexOf(key)
    return index === -1 ? null : index
  }
  /** The rows shown now have entered: rows revealed after this count from zero again. */
  const settle = () => {
    known.value = new Set([...known.value, ...toValue(keys)])
  }

  // A row that left and comes back is an arrival again.
  watch(
    () => toValue(keys),
    (current) => {
      const kept = [...known.value].filter((key) => current.includes(key))
      if (kept.length < known.value.size) known.value = new Set(kept)
    }
  )

  return { staggerIndexOf, settle }
}
