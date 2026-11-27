<script setup lang="ts">
import PanelFoldButton from '@/components/panel/PanelFoldButton.vue'

// A folded panel list (`useFoldedRows`): its first rows, the rest behind "Mehr anzeigen", shut
// again with "Weniger anzeigen". Opened, it stops at a fixed height and scrolls inside:
// a long list never pushes the panel past the window, and a new row on top does not
// move every section below. `relative` keeps the rows' `sr-only` labels inside the scroll area.
// A list of tall rows is not capped (`isCapped` false): five subagents with their tool calls are
// taller than the cap, so opening it shrank the list into a scroll box (Jonas, 27.11.2026).
const {
  isExpanded,
  isFoldable,
  hiddenCount,
  controls,
  isCapped = true
} = defineProps<{
  isExpanded: boolean
  isFoldable: boolean
  hiddenCount: number
  /** The id of the list in the slot */
  controls: string
  /** Opened, it scrolls inside a fixed height */
  isCapped?: boolean
}>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <div class="flex flex-col">
    <div
      class="relative"
      :class="{
        'max-h-72 overflow-x-hidden overflow-y-auto overscroll-contain': isCapped && isExpanded
      }"
    >
      <slot />
    </div>
    <!-- The list's own actions share the row with the fold. It comes and goes with the fold of a
         live list, so it grows in like a row (`pt-1` instead of a gap, which would snap). -->
    <Transition name="row-grow">
      <div v-if="isFoldable || $slots.actions">
        <div class="flex items-center gap-2 pt-1">
          <PanelFoldButton
            v-if="isFoldable"
            :is-expanded
            :hidden-count
            :controls
            @toggle="emit('toggle')"
          />
          <slot name="actions" />
        </div>
      </div>
    </Transition>
  </div>
</template>
