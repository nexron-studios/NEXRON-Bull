import { ref, type Ref } from 'vue'

/**
 * Whether any of the given `truncate` elements cuts its text off, for a tooltip that shows the
 * full text only then. Measured on `measure` (call it when the pointer or focus arrives), not on
 * every resize: only then can the tooltip open.
 */
export const useClipped = (elements: Ref<HTMLElement | null>[]) => {
  const isClipped = ref(false)

  const measure = () => {
    isClipped.value = elements.some(({ value: el }) => !!el && el.scrollWidth > el.clientWidth)
  }

  return { isClipped, measure }
}
