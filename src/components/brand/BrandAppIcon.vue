<script setup lang="ts">
// The app icon, bull on its dark tile, as the system shows it. Every toast carries it, so toasts
// look like they come from the same app as the system notifications.

// Bound instead of a literal `src`: the template compiler turns a literal into a module import,
// which Vitest resolves as a file path and fails on. It is served from `public/` as it is.
const APP_ICON_URL = '/icons/icon-192.png'
</script>

<template>
  <img :src="APP_ICON_URL" alt="" class="block size-full select-none" draggable="false" />
</template>
