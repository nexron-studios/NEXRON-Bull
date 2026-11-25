import { computed, type Ref } from 'vue'
import { useImageRefFormat } from '@/composables/useImageRefFormat'
import type { PendingImage } from '@/utils/content'
import {
  imageRefAt,
  insertAfter,
  insertImageRefs,
  remapImageRefs,
  validImageRefsOf,
  type DeleteDirection,
  type RefImage,
  type TextSelection
} from '@/utils/imageRefs'
import type { Highlight } from '@/utils/textPieces'

const DELETE_KEYS: Partial<Record<string, DeleteDirection>> = {
  Backspace: 'backward',
  Delete: 'forward'
}

/**
 * "[Bild 2 (Name…)]" in the draft for each attachment it names. Claude gets the images in the
 * order of the chips but no file names, so the number is what tells it which image is meant; it
 * follows the chips when they move and the reference goes when its image goes.
 */
export const useImageReferences = (draft: Ref<string>, images: Ref<PendingImage[]>) => {
  const format = useImageRefFormat()
  const refs = computed(() => validImageRefsOf(draft.value, images.value, format.value))
  // Only a reference as the app wrote it gets a chip: one typed with plain spaces could wrap
  // inside, and the chip over it would break apart.
  const highlights = computed<Highlight[]>(() =>
    refs.value.flatMap(({ start, end, n, name, image }) =>
      draft.value.slice(start, end) === format.value.render(n, image.name)
        ? [
            {
              start,
              end,
              kind: 'image' as const,
              n,
              name,
              src: image.src
            }
          ]
        : []
    )
  )

  /** The attachments changed from `before` to `after`; `successors` maps a replaced image on. */
  const follow = (
    before: readonly RefImage[],
    after: readonly RefImage[],
    successors?: Readonly<Record<string, string>>
  ) => {
    draft.value = remapImageRefs(draft.value, before, after, format.value, successors)
  }

  /**
   * References to `added` where the user writes, or at the end; gives the caret after them, or
   * `null` when none of them is attached (anymore).
   */
  const insert = (
    added: readonly PendingImage[],
    selection: TextSelection | null
  ): number | null => {
    const tokens = added.flatMap((image) => {
      const at = images.value.findIndex((attached) => attached.id === image.id)
      return at < 0 ? [] : [format.value.render(at + 1, image.name)]
    })
    if (!tokens.length) return null
    const end = draft.value.length
    const { text, caret } = insertImageRefs(draft.value, selection ?? { start: end, end }, tokens)
    draft.value = text
    return caret
  }

  /**
   * `addition` right behind the first reference to the image `id`, so a note about it stands next
   * to the chip it means; false when the draft names that image nowhere.
   */
  const appendAfter = (id: string, addition: string) => {
    const ref = refs.value.find(({ image }) => image.id === id)
    if (!ref) return false
    draft.value = insertAfter(draft.value, ref.end, addition)
    return true
  }

  /**
   * Backspace or Delete at a reference selects all of it, so the browser removes it as one unit and
   * its own undo brings it back whole.
   */
  const selectWhole = (event: KeyboardEvent, field: HTMLTextAreaElement) => {
    const direction = DELETE_KEYS[event.key]
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return
    if (field.selectionStart !== field.selectionEnd) return
    const ref = imageRefAt(refs.value, field.selectionStart, direction)
    if (ref) field.setSelectionRange(ref.start, ref.end)
  }

  return { format, highlights, follow, insert, appendAfter, selectWhole }
}
