<script setup lang="ts">
// public/favicon.svg is the one source of the bull: app icon, favicon, README banner and this mark.
// As a mask over `bg-brand`, so the bull takes the accent of the colour scheme like Clawd does.
const { size = 20 } = defineProps<{ size?: number }>()
</script>

<template>
  <span
    class="block shrink-0 bg-brand mask-[url(/favicon.svg)] mask-contain mask-center mask-no-repeat select-none"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  />
</template>
