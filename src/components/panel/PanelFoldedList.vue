<script setup lang="ts">
import PanelFoldButton from '@/components/panel/PanelFoldButton.vue'

// A folded panel list (`useFoldedRows`): its first rows, the rest behind "Mehr anzeigen", shut
// again with "Weniger anzeigen". Opened, it stops at a fixed height and scrolls inside (Jonas,
// 24.11.2026): a long list never pushes the panel past the window, and a new row on top does not
// move every section below. `relative` keeps the rows' `sr-only` labels inside the scroll area.
const { isExpanded, isFoldable, hiddenCount, controls } = defineProps<{
  isExpanded: boolean
  isFoldable: boolean
  hiddenCount: number
  /** The id of the list in the slot */
  controls: string
}>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <div
      class="relative"
      :class="{ 'max-h-72 overflow-x-hidden overflow-y-auto overscroll-contain': isExpanded }"
    >
      <slot />
    </div>
    <!-- The list's own actions share the row with the fold. -->
    <div v-if="isFoldable || $slots.actions" class="flex items-center gap-2">
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
</template>
