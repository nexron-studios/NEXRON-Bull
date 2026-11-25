<script setup lang="ts" generic="T extends string | number">
import { computed, useTemplateRef } from 'vue'
import { useSlidingMarker } from '@/composables/useSlidingMarker'

// A filter of a whole page or section (usage days, finished sessions): one choice, pressed
// buttons in a labelled group. `shortLabel` replaces the label on a phone; the `option` slot
// puts something next to the label, such as a series key. `isFull` spreads the choices over the
// whole width, as in a popover.
const { isFull = false } = defineProps<{
  options: readonly { value: T; label: string; shortLabel?: string }[]
  /** Names the group for screen readers */
  label: string
  isFull?: boolean
}>()

const selected = defineModel<T>({ required: true })

const group = useTemplateRef<HTMLElement>('group')
const marker = useTemplateRef<HTMLElement>('marker')

// One marker glides to the pressed choice; until it is measured, the choice paints itself. No
// colour transition on the buttons: a transition utility would override motion-press's spring.
const { box } = useSlidingMarker(group, marker, selected)
const markerStyle = computed(() =>
  box.value ? { width: `${box.value.width}px`, transform: `translateX(${box.value.x}px)` } : {}
)
</script>

<template>
  <div
    ref="group"
    role="group"
    :aria-label="label"
    class="relative shrink-0 rounded-lg bg-muted p-0.5 text-small"
    :class="isFull ? 'flex w-full' : 'inline-flex'"
  >
    <span
      ref="marker"
      class="pointer-events-none absolute inset-y-0.5 left-0 origin-left rounded-md bg-background shadow-sm"
      :class="{ invisible: !box }"
      :style="markerStyle"
      aria-hidden="true"
    />
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="selected === option.value"
      :class="[
        isFull ? 'min-w-0 flex-1 px-1.5' : 'px-2.5',
        !box && 'aria-pressed:bg-background aria-pressed:shadow-sm'
      ]"
      class="motion-press relative min-h-7 touch-manipulation rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:font-medium aria-pressed:text-foreground"
      @click="selected = option.value"
    >
      <slot name="option" :option>
        <template v-if="option.shortLabel">
          <span class="sm:hidden">{{ option.shortLabel }}</span>
          <span class="hidden sm:inline">{{ option.label }}</span>
        </template>
        <template v-else>{{ option.label }}</template>
      </slot>
    </button>
  </div>
</template>
