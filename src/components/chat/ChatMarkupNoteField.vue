<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Input } from '@/components/ui/input'
import type { Point, Size } from '@/utils/markup'

// A small field on the image, next to the spot it is about: the note of a mark, or a word to write
// into the image. Enter or leaving it is done; Esc is cancel and stays inside this field, so the
// preview behind it does not close.
const { natural, at, color, label, placeholder } = defineProps<{
  natural: Size
  at: Point
  /** The mark's colour, as the dot in front of the field */
  color: string
  label: string
  placeholder: string
}>()
const emit = defineEmits<{ done: []; cancel: [] }>()
const text = defineModel<string>({ required: true })

/**
 * The field sits right of the spot, vertically centred on it. Past these fractions of the image
 * it opens to the left, upwards or downwards instead, so it stays inside the image.
 */
const FLIP_X = 0.6
const EDGE_Y = 0.12

const field = ref<InstanceType<typeof Input> | null>(null)
// Enter ends the field and unmounting it blurs, which would end it a second time.
const isDone = ref(false)

const position = computed(() => {
  const x = at.x / natural.width
  const y = at.y / natural.height
  return {
    style: { left: `${x * 100}%`, top: `${y * 100}%` },
    class: [
      x > FLIP_X ? '-ml-3 -translate-x-full' : 'ml-3',
      y > 1 - EDGE_Y ? '-translate-y-full' : y < EDGE_Y ? '' : '-translate-y-1/2'
    ]
  }
})

const finish = (outcome: 'done' | 'cancel') => {
  if (isDone.value) return
  isDone.value = true
  if (outcome === 'done') emit('done')
  else emit('cancel')
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    finish('done')
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    finish('cancel')
  }
}

onMounted(() => (field.value?.$el as HTMLInputElement | undefined)?.focus())
</script>

<template>
  <div
    class="absolute z-10 flex w-60 items-center gap-2 rounded-lg border border-border bg-popover py-1 pr-1 pl-2 text-popover-foreground shadow-xl"
    :class="position.class"
    :style="position.style"
    @pointerdown.stop
  >
    <span
      class="size-3 shrink-0 rounded-full ring-1 ring-border"
      :style="{ backgroundColor: color }"
      aria-hidden="true"
    />
    <Input
      ref="field"
      v-model="text"
      :aria-label="label"
      :placeholder
      class="h-7 border-0 bg-transparent px-1 text-small focus-visible:ring-0"
      @keydown="handleKeydown"
      @blur="finish('done')"
    />
  </div>
</template>
