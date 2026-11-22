<script setup lang="ts">
// Claude as the Clawd pixel mark (docs/design/build.mjs), never the Anthropic logo. Brand blue,
// not Claude orange, so it follows every theme (18.11.2026).
const { size = 10 } = defineProps<{ size?: number }>()
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="1 0 16 10"
    shape-rendering="crispEdges"
    class="shrink-0 text-brand"
    :width="size * 1.6"
    :height="size"
    aria-hidden="true"
  >
    <g fill="currentColor">
      <rect x="3" y="0" width="12" height="2" />
      <rect x="3" y="2" width="2" height="2" />
      <rect x="6" y="2" width="6" height="2" />
      <rect x="13" y="2" width="2" height="2" />
      <rect x="1" y="4" width="16" height="2" />
      <rect x="3" y="6" width="12" height="2" />
      <rect x="4" y="8" width="1" height="2" />
      <rect x="6" y="8" width="1" height="2" />
      <rect x="11" y="8" width="1" height="2" />
      <rect x="13" y="8" width="1" height="2" />
    </g>
  </svg>
</template>
