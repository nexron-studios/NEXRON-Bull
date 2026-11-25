import { computed, ref } from 'vue'
import { createInjectionState } from '@vueuse/core'
import {
  commitStrokes,
  emptyHistory,
  markNumbersOf,
  markupCommentOf,
  redoHistory,
  undoHistory,
  type MarkupColor,
  type MarkupNotes,
  type MarkupSize,
  type MarkupTool,
  type Stroke
} from '@/utils/markup'

/**
 * Drawing state of the preview: tool, colour, size, strokes with undo, comment, and a note per
 * mark. Provided by the lightbox, read by the canvas, the toolbars and the comment panel. The
 * comment can be written while only viewing; the strokes and notes only while marking.
 *
 * Notes live beside the undo history, keyed by mark id: typing is not an undo step, and a mark
 * that comes back by redo finds its note again. A note of a mark that is gone is never shown.
 */
const [useProvideMarkup, useInjectedMarkup] = createInjectionState(() => {
  const tool = ref<MarkupTool>('pen')
  const color = ref<MarkupColor>('critical')
  const size = ref<MarkupSize>('m')
  const history = ref(emptyHistory())
  const comment = ref('')
  const notes = ref<MarkupNotes>({})
  /** The mark whose note field is open on the image */
  const editingId = ref<string | null>(null)
  const isKeepingOriginal = ref(false)

  const strokes = computed(() => history.value.present)
  const canUndo = computed(() => history.value.past.length > 0)
  const canRedo = computed(() => history.value.future.length > 0)
  const isDirty = computed(() => strokes.value.length > 0 || !!comment.value.trim())
  const numbers = computed(() => markNumbersOf(strokes.value, notes.value))
  /** General comment and numbered notes, as they go into the composer */
  const fullComment = computed(() => markupCommentOf(comment.value, strokes.value, notes.value))

  const setNote = (id: string, text: string) => {
    notes.value = { ...notes.value, [id]: text }
  }
  /** Leaving a note field: an empty note gives its number back. */
  const settleNote = (id: string) => {
    if (notes.value[id]?.trim()) return
    const { [id]: _dropped, ...rest } = notes.value
    notes.value = rest
  }

  const commit = (next: Stroke[]) => {
    history.value = commitStrokes(history.value, next)
  }
  const undo = () => {
    history.value = undoHistory(history.value)
  }
  const redo = () => {
    history.value = redoHistory(history.value)
  }
  /** Back to viewing: the drawing goes, the comment stays for the same image. */
  const clearStrokes = () => {
    history.value = emptyHistory()
    notes.value = {}
    editingId.value = null
    isKeepingOriginal.value = false
  }
  /** A fresh sheet for the next image; tool, colour and size stay as chosen. */
  const reset = () => {
    clearStrokes()
    comment.value = ''
  }

  return {
    tool,
    color,
    size,
    comment,
    notes,
    editingId,
    isKeepingOriginal,
    strokes,
    numbers,
    fullComment,
    setNote,
    settleNote,
    canUndo,
    canRedo,
    isDirty,
    commit,
    undo,
    redo,
    clearStrokes,
    reset
  }
})

export { useProvideMarkup }

export const useMarkup = () => {
  const markup = useInjectedMarkup()
  if (!markup) throw new Error('useMarkup needs useProvideMarkup in an ancestor')
  return markup
}
