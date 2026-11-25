<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useElementBounding } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import ChatMarkupNoteField from '@/components/chat/ChatMarkupNoteField.vue'
import { useMarkup } from '@/composables/useMarkup'
import { useMarkupPlacing } from '@/composables/useMarkupPlacing'
import { useIsPhone } from '@/composables/useViewport'
import {
  MARKUP_COLOR_TOKENS,
  anchorOf,
  eraserRadiusOf,
  strokeWidthOf,
  toImagePoint,
  type LineStroke,
  type Point,
  type Size,
  type Stroke
} from '@/utils/markup'
import { drawStrokes, textFontOf } from '@/utils/markupCanvas'
import { eraseAlong } from '@/utils/markupEraser'

// Drawing layer over the image, at the image's natural resolution. Pointer events cover mouse,
// pen and touch alike; one pointer draws at a time, so a resting palm does not add a stroke.
// Every finished mark opens its note field; a click on a number opens it again.
const { natural } = defineProps<{ natural: Size }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const activePointer = ref<number | null>(null)
// Live state of the gesture; drawn by hand on every move instead of through reactivity.
const draft = shallowRef<LineStroke | null>(null)
const remaining = shallowRef<readonly Stroke[] | null>(null)
/** Where the eraser was at the last event, so a fast drag erases the whole stretch between. */
const eraserFrom = shallowRef<Point | null>(null)
/** The pointer in client pixels, for the eraser's outline. */
const hover = ref<Point | null>(null)
// Follows scrolling and zooming, so the outline stays under a pointer that does not move.
const bounds = useElementBounding(canvas)

const { t } = useI18n()
const markup = useMarkup()
const isPhone = useIsPhone()

const isErasing = computed(() => markup.tool.value === 'eraser')

/** Screen pixels per image pixel, as the image is shown right now. */
const screenScale = () => (canvas.value?.getBoundingClientRect().width ?? 0) / natural.width

const resolvedColor = () =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(MARKUP_COLOR_TOKENS[markup.color.value])
    .trim()

const measureText = (text: string, size: number) => {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return 0
  ctx.font = textFontOf(size)
  return ctx.measureText(text).width
}

const placing = useMarkupPlacing({ markup, screenScale, resolvedColor, measureText })
const { editing, note, isNoteFocused, textDraft } = placing

const redraw = () => {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, natural.width, natural.height)
  drawStrokes(ctx, remaining.value ?? markup.strokes.value, markup.numbers.value)
  if (draft.value) drawStrokes(ctx, [draft.value])
}

const pointOf = (event: PointerEvent): Point =>
  toImagePoint(
    { x: event.clientX, y: event.clientY },
    canvas.value?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 },
    natural
  )

const eraserRadius = () => eraserRadiusOf(markup.size.value, screenScale())

const eraserCursor = computed(() => {
  if (!isErasing.value || !hover.value) return null
  const diameter = eraserRadiusOf(markup.size.value, 1) * 2
  return {
    left: `${hover.value.x - bounds.left.value}px`,
    top: `${hover.value.y - bounds.top.value}px`,
    width: `${diameter}px`,
    height: `${diameter}px`
  }
})

const trackHover = (event: PointerEvent) => {
  hover.value = { x: event.clientX, y: event.clientY }
}

const eraseTo = (point: Point) => {
  if (!remaining.value) return
  remaining.value = eraseAlong(remaining.value, eraserFrom.value ?? point, point, eraserRadius())
  eraserFrom.value = point
}

const handleDown = (event: PointerEvent) => {
  if (activePointer.value !== null || !event.isPrimary) return
  event.preventDefault()
  // An open field ends with the next click on the image, whatever that click does.
  placing.closeAll()
  trackHover(event)
  const point = pointOf(event)
  if (placing.placeAt(point)) return
  canvas.value?.setPointerCapture(event.pointerId)
  activePointer.value = event.pointerId
  const tool = markup.tool.value
  if (tool === 'eraser') {
    remaining.value = markup.strokes.value
    eraseTo(point)
  } else if (tool !== 'pin' && tool !== 'text') {
    const isShape = tool === 'arrow' || tool === 'rect'
    draft.value = {
      id: crypto.randomUUID(),
      tool,
      color: resolvedColor(),
      badge: placing.badgeRadius(),
      anchor: point,
      width: strokeWidthOf(tool, markup.size.value, screenScale()),
      points: isShape ? [point, point] : [point]
    }
  }
  redraw()
}

const handleMove = (event: PointerEvent) => {
  if (event.isPrimary) trackHover(event)
  if (event.pointerId !== activePointer.value) return
  const point = pointOf(event)
  eraseTo(point)
  const stroke = draft.value
  if (stroke && (stroke.tool === 'arrow' || stroke.tool === 'rect')) {
    draft.value = { ...stroke, points: [stroke.points[0] ?? point, point] }
  } else if (stroke) {
    stroke.points.push(point)
  }
  redraw()
}

const isVisible = (stroke: LineStroke) => {
  const [first, last] = [stroke.points[0], stroke.points.at(-1)]
  if (stroke.tool !== 'arrow' && stroke.tool !== 'rect') return true
  return !!first && !!last && (first.x !== last.x || first.y !== last.y)
}

const handleUp = (event: PointerEvent) => {
  if (event.pointerId !== activePointer.value) return
  activePointer.value = null
  const stroke = draft.value
  const left = remaining.value
  draft.value = null
  remaining.value = null
  eraserFrom.value = null
  if (stroke && isVisible(stroke)) {
    markup.commit([
      ...markup.strokes.value,
      { ...stroke, anchor: anchorOf(stroke.tool, stroke.points) }
    ])
    // On the phone the keyboard would cover the image after every line; there a tap opens it.
    placing.openNote(stroke.id, !isPhone.value)
  }
  // One drag is one undo step, however many strokes it cut.
  if (left && left !== markup.strokes.value) markup.commit([...left])
  redraw()
}

const handleCancel = (event: PointerEvent) => {
  if (event.pointerId !== activePointer.value) return
  activePointer.value = null
  draft.value = null
  remaining.value = null
  eraserFrom.value = null
  hover.value = null
  redraw()
}

watch(markup.strokes, () => {
  // Undo or redo during a drag: the eraser's copy is stale, so this drag erases nothing.
  if (activePointer.value !== null) remaining.value = null
  redraw()
})
watch(markup.numbers, redraw)
watch(canvas, redraw)
</script>

<template>
  <canvas
    ref="canvas"
    :width="natural.width"
    :height="natural.height"
    role="img"
    :aria-label="t('images.canvas')"
    class="absolute inset-0 size-full touch-none"
    :class="isErasing ? 'cursor-none' : 'cursor-crosshair'"
    @pointerdown="handleDown"
    @pointermove="handleMove"
    @pointerup="handleUp"
    @pointercancel="handleCancel"
    @pointerleave="hover = null"
  />
  <div
    v-if="eraserCursor"
    aria-hidden="true"
    class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-stage-foreground shadow-[0_0_0_1px_var(--stage)]"
    :style="eraserCursor"
  />
  <ChatMarkupNoteField
    v-if="editing"
    :id="editing.id"
    :key="editing.id"
    v-model="note"
    :natural
    :at="editing.at"
    :color="editing.color"
    :is-focused="isNoteFocused"
    :label="t('images.note_label')"
    :placeholder="t('images.note_placeholder')"
    @done="placing.closeNote"
    @cancel="placing.closeNote"
    @history="markup[$event]()"
  />
  <ChatMarkupNoteField
    v-if="textDraft"
    :id="textDraft.id"
    :key="textDraft.id"
    v-model="textDraft.text"
    variant="text"
    :natural
    :at="textDraft.at"
    :color="resolvedColor()"
    :label="t('images.text_label')"
    :placeholder="t('images.text_placeholder')"
    @done="placing.closeText($event, true)"
    @cancel="placing.closeText($event, false)"
  />
</template>
