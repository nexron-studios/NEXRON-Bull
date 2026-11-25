import { computed, ref } from 'vue'
import { createInjectionState } from '@vueuse/core'
import {
  commitStrokes,
  emptyHistory,
  markNumbersOf,
  markupNotesOf,
  redoHistory,
  settledNotesOf,
  undoHistory,
  withoutMark,
  type MarkNote,
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
  /** Numbers already burnt into the image (a marked copy marked again); set by the preview */
  const burntIn = ref(0)
  /** The attachment's notes from earlier rounds as it has them, and as they are being changed */
  const savedNotes = ref<MarkNote[]>([])
  const earlierNotes = ref<MarkNote[]>([])

  const strokes = computed(() => history.value.present)
  const canUndo = computed(() => history.value.past.length > 0)
  const canRedo = computed(() => history.value.future.length > 0)
  const hasChangedNotes = computed(
    () => JSON.stringify(settledNotesOf(earlierNotes.value)) !== JSON.stringify(savedNotes.value)
  )
  const isDirty = computed(
    () => strokes.value.length > 0 || !!comment.value.trim() || hasChangedNotes.value
  )
  const numbers = computed(() => markNumbersOf(strokes.value, notes.value, burntIn.value))
  /** The highest number in the image once this round is burnt in */
  const markCount = computed(() => burntIn.value + numbers.value.size)
  /** Every note the image has once this round is applied: earlier ones as changed, then new ones */
  const allNotes = computed(() => [
    ...settledNotesOf(earlierNotes.value),
    ...markupNotesOf(strokes.value, notes.value, burntIn.value)
  ])

  /** The image the preview shows now, and the notes it brings from earlier rounds. */
  const load = (image: { markCount?: number; notes?: MarkNote[] } | null) => {
    burntIn.value = image?.markCount ?? 0
    savedNotes.value = image?.notes ?? []
    earlierNotes.value = [...savedNotes.value]
  }
  /** An earlier note keeps its number, as that is burnt into the image; emptied, it goes on apply. */
  const setEarlierNote = (number: number, text: string) => {
    earlierNotes.value = earlierNotes.value.map((note) =>
      note.number === number ? { number, text } : note
    )
  }
  const removeEarlierNote = (number: number) => {
    earlierNotes.value = earlierNotes.value.filter((note) => note.number !== number)
  }

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
  /** One undo step; its note stays beside the history, so undo brings both back. */
  const removeMark = (id: string) => {
    if (editingId.value === id) editingId.value = null
    commit(withoutMark(strokes.value, id))
  }
  const undo = () => {
    history.value = undoHistory(history.value)
  }
  const redo = () => {
    history.value = redoHistory(history.value)
  }
  /** A fresh sheet for the next image; tool, colour and size stay as chosen. */
  const reset = () => {
    history.value = emptyHistory()
    notes.value = {}
    editingId.value = null
    isKeepingOriginal.value = false
    comment.value = ''
    earlierNotes.value = [...savedNotes.value]
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
    allNotes,
    earlierNotes,
    load,
    setEarlierNote,
    removeEarlierNote,
    markCount,
    setNote,
    settleNote,
    canUndo,
    canRedo,
    isDirty,
    commit,
    removeMark,
    undo,
    redo,
    reset
  }
})

export { useProvideMarkup }

export const useMarkup = () => {
  const markup = useInjectedMarkup()
  if (!markup) throw new Error('useMarkup needs useProvideMarkup in an ancestor')
  return markup
}
