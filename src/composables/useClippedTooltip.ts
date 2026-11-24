import { ref, type Ref } from 'vue'

/**
 * A controlled tooltip that opens only while one of the given `truncate` elements cuts its text
 * off. Measured at the moment the tooltip wants to open (hover or keyboard focus), so it is never
 * stale and needs no observer. Bind `open` and `setOpen` to the Tooltip's `open` model.
 */
export const useClippedTooltip = (elements: Ref<HTMLElement | null>[]) => {
  const open = ref(false)

  const isClipped = () => elements.some(({ value: el }) => !!el && el.scrollWidth > el.clientWidth)

  const setOpen = (next: boolean) => {
    open.value = next && isClipped()
  }

  return { open, setOpen }
}
