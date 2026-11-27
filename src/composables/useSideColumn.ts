import { computed, ref, type Ref } from 'vue'
import type { ColumnWish } from '@/utils/chatColumns'
import type { ColumnSize } from '@/utils/sideColumn'

export interface SideColumnOptions {
  /** Saved: whether the user wants the column */
  isOpen: Ref<boolean>
  /** Saved width, `null` for the column's default */
  storedWidth: Ref<number | null>
  minWidth: number
  /** Animates this column's layout changes (`useLayoutGlide`) */
  glide: (update: () => void, isNewLayout: boolean) => Promise<void>
}

/**
 * A column right of the chat, as its edge changes it: while the edge is dragged the size lives in
 * a draft, and localStorage is written once, on release. A drag that would shut the column keeps
 * it on screen at its minimum (`isClosing`), so it can still come back.
 */
export const useSideColumn = ({ isOpen, storedWidth, minWidth, glide }: SideColumnOptions) => {
  const draft = ref<ColumnSize | null>(null)

  const isClosing = computed(() => draft.value?.isOpen === false)
  const wish = computed((): ColumnWish => {
    if (isClosing.value) return { isOpen: isOpen.value, width: minWidth }
    const width = draft.value?.isOpen ? draft.value.width : storedWidth.value
    return { isOpen: isOpen.value, width }
  })

  const preview = (next: ColumnSize) => {
    draft.value = next
  }
  // Never opens the column: a drag that ends because the shortcut shut it mid-drag keeps it shut.
  // Shutting keeps the stored width, which may be wider than this window shows.
  const resize = (next: ColumnSize, isShown: boolean) =>
    glide(() => {
      draft.value = null
      if (next.isOpen) storedWidth.value = next.width
      else isOpen.value = false
    }, !next.isOpen && isShown)
  const resetWidth = () =>
    glide(() => {
      draft.value = null
      storedWidth.value = null
    }, false)

  return { isClosing, wish, preview, resize, resetWidth }
}
