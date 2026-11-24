import { computed, ref } from 'vue'
import { createInjectionState } from '@vueuse/core'
import {
  commitStrokes,
  emptyHistory,
  redoHistory,
  undoHistory,
  type MarkupColor,
  type MarkupSize,
  type MarkupTool,
  type Stroke
} from '@/utils/markup'

/**
 * Drawing state of the preview: tool, colour, size, strokes with undo, comment. Provided by the
 * lightbox, read by the canvas, the toolbars and the comment panel. The comment can be written
 * while only viewing; the strokes only while marking.
 */
const [useProvideMarkup, useInjectedMarkup] = createInjectionState(() => {
  const tool = ref<MarkupTool>('pen')
  const color = ref<MarkupColor>('critical')
  const size = ref<MarkupSize>('m')
  const history = ref(emptyHistory())
  const comment = ref('')
  const isKeepingOriginal = ref(false)

  const strokes = computed(() => history.value.present)
  const canUndo = computed(() => history.value.past.length > 0)
  const canRedo = computed(() => history.value.future.length > 0)
  const isDirty = computed(() => strokes.value.length > 0 || !!comment.value.trim())

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
    isKeepingOriginal,
    strokes,
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
