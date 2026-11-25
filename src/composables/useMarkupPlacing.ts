import { computed, ref, watch } from 'vue'
import type { useMarkup } from '@/composables/useMarkup'
import {
  BADGE_RADIUS_PX,
  TEXT_SIZE_PX,
  type PinStroke,
  type Point,
  type TextStroke
} from '@/utils/markup'

interface MarkupPlacingOptions {
  markup: ReturnType<typeof useMarkup>
  /** Screen pixels per image pixel, as the image is shown right now */
  screenScale: () => number
  /** The chosen colour as a CSS value */
  resolvedColor: () => string
  /** Width of `text` at font size `size`, in the same pixels as `size` */
  measureText: (text: string, size: number) => number
}

/** A text being written: where it goes and what is typed so far. */
interface TextDraft {
  id: string
  at: Point
  text: string
}

/**
 * What a click on the image places instead of drawing: a pin, a text, or the note field of a
 * numbered mark. One field is open at a time; every close names the field it is for, so the blur
 * of a field that just went cannot close the one the same click opened.
 */
export const useMarkupPlacing = ({
  markup,
  screenScale,
  resolvedColor,
  measureText
}: MarkupPlacingOptions) => {
  const textDraft = ref<TextDraft | null>(null)
  /** Whether the open note field takes the keyboard; not after a drawn line on the phone */
  const isNoteFocused = ref(true)

  /** The mark whose note is open, as long as it is still there (undo can take it away). */
  const editing = computed(() => {
    const id = markup.editingId.value
    const stroke = id ? markup.strokes.value.find((mark) => mark.id === id) : undefined
    return stroke ? { id: stroke.id, at: stroke.anchor, color: stroke.color } : null
  })

  const note = computed({
    get: () => (editing.value ? (markup.notes.value[editing.value.id] ?? '') : ''),
    set: (text: string) => {
      if (editing.value) markup.setNote(editing.value.id, text)
    }
  })

  const badgeRadius = () => BADGE_RADIUS_PX[markup.size.value] / screenScale()

  const openNote = (id: string, isFocused: boolean) => {
    isNoteFocused.value = isFocused
    markup.editingId.value = id
  }

  const closeNote = (id: string) => {
    if (markup.editingId.value !== id) return
    markup.settleNote(id)
    markup.editingId.value = null
  }

  const closeText = (id: string, isKept: boolean) => {
    const written = textDraft.value
    if (written?.id !== id) return
    textDraft.value = null
    const text = written.text.trim()
    if (!isKept || !text) return
    const size = TEXT_SIZE_PX[markup.size.value] / screenScale()
    const mark: TextStroke = {
      id,
      tool: 'text',
      color: resolvedColor(),
      badge: badgeRadius(),
      anchor: written.at,
      size,
      textWidth: measureText(text, size),
      text,
      points: [written.at]
    }
    markup.commit([...markup.strokes.value, mark])
  }

  /** Ends whatever field is open, keeping what was written. */
  const closeAll = () => {
    if (markup.editingId.value) closeNote(markup.editingId.value)
    if (textDraft.value) closeText(textDraft.value.id, true)
  }

  /** The numbered mark whose badge is under `point`, the topmost first. */
  const badgeAt = (point: Point) => {
    const hits = markup.strokes.value.filter(
      ({ id, anchor, badge }) =>
        markup.numbers.value.has(id) && Math.hypot(point.x - anchor.x, point.y - anchor.y) <= badge
    )
    return hits.at(-1)?.id ?? null
  }

  const placePin = (point: Point) => {
    const pin: PinStroke = {
      id: crypto.randomUUID(),
      tool: 'pin',
      color: resolvedColor(),
      badge: badgeRadius(),
      anchor: point,
      points: [point]
    }
    markup.commit([...markup.strokes.value, pin])
    openNote(pin.id, true)
  }

  /** A click that places something instead of drawing; false when it starts a stroke. */
  const placeAt = (point: Point) => {
    const tool = markup.tool.value
    const hit = tool === 'eraser' ? null : badgeAt(point)
    if (hit) openNote(hit, true)
    else if (tool === 'text') textDraft.value = { id: crypto.randomUUID(), at: point, text: '' }
    else if (tool === 'pin') placePin(point)
    else return false
    return true
  }

  // Undo took the mark whose note was open: its field goes with it.
  watch(editing, (now, before) => {
    if (!now && before) closeNote(before.id)
  })

  return {
    editing,
    note,
    isNoteFocused,
    textDraft,
    badgeRadius,
    openNote,
    closeNote,
    closeText,
    closeAll,
    placeAt
  }
}
