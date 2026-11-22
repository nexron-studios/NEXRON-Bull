<script setup lang="ts">
// The shadow a bar casts over the content that scrolls past it (layout.md, "Bars over scrolling
// content show depth"). It lies over the scroll area at the bar's side, inside a positioned
// wrapper, and fades in only while content goes on beyond that edge (`useScrollEdges`); at rest
// the bar is flat.
const { edge, isShown } = defineProps<{
  /**
   * The side of the scroll area the bar sits on; `below` hangs it from a sticky bar inside the
   * scroll area, placed in that bar
   */
  edge: 'top' | 'bottom' | 'below'
  isShown: boolean
}>()

// Eased rather than linear: dense near the bar, then a long soft tail, like a real shadow.
const EDGE_CLASS: Record<typeof edge, string> = {
  top: 'top-0 bg-linear-to-b',
  below: 'top-full bg-linear-to-b',
  bottom: 'bottom-0 bg-linear-to-t'
}
</script>

<template>
  <div
    class="pointer-events-none absolute inset-x-0 h-4 from-shadow-edge via-shadow-edge/35 via-35% to-transparent transition-opacity duration-150 ease-out"
    :class="[EDGE_CLASS[edge], isShown ? 'opacity-100' : 'opacity-0']"
    aria-hidden="true"
  />
</template>
