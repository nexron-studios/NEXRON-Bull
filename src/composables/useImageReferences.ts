import { computed, type Ref } from 'vue'
import { useImageRefFormat, useNoteLineFormat } from '@/composables/useImageRefFormat'
import type { PendingImage } from '@/utils/content'
import {
  imageRefAt,
  insertImageRefs,
  remapImageRefs,
  validImageRefsOf,
  type DeleteDirection,
  type RefImage,
  type TextSelection
} from '@/utils/imageRefs'
import { notesOfImage, remapNoteLines, withImageNotes } from '@/utils/imageNotes'
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
  const noteFormat = useNoteLineFormat()
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

  /**
   * The attachments changed from `before` to `after`; `successors` maps a replaced image on. Note
   * lines name their image like the chips do, so they follow it the same way.
   */
  const follow = (
    before: readonly RefImage[],
    after: readonly RefImage[],
    successors?: Readonly<Record<string, string>>
  ) => {
    const refsFollowed = remapImageRefs(draft.value, before, after, format.value, successors)
    draft.value = remapNoteLines(refsFollowed, before, after, noteFormat.value, successors)
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

  /** The image `id`'s number in the references, from 1; 0 when it is not attached. */
  const numberOf = (id: string) => images.value.findIndex((image) => image.id === id) + 1

  /** The notes the draft has on the image `id` from earlier rounds. */
  const notesOf = (id: string) => notesOfImage(draft.value, numberOf(id), noteFormat.value)

  /**
   * Note lines for the image `id` under the line with its first reference, each naming the image,
   * so they stay its own beside another chip's; false when the draft names the image nowhere.
   */
  const addNotes = (id: string, notes: readonly string[]) => {
    const ref = refs.value.find(({ image }) => image.id === id)
    if (!ref) return false
    draft.value = withImageNotes(draft.value, ref.end, ref.n, notes, noteFormat.value)
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

  return { format, highlights, follow, insert, notesOf, addNotes, selectWhole }
}
