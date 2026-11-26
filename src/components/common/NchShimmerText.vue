<script setup lang="ts">
// Text with the "Claude is working" shimmer (`shimmer-window` in main.css). It stays in one line
// and truncates, so the brighter copy lies exactly on it. The copy is decoration only.
const { text, isActive = true } = defineProps<{ text: string; isActive?: boolean }>()
</script>

<template>
  <span class="relative truncate">
    <span :class="{ 'text-muted-foreground': isActive }">{{ text }}</span>
    <span
      v-if="isActive"
      class="pointer-events-none absolute inset-0 shimmer-window overflow-hidden"
      aria-hidden="true"
    >
      <span class="block shimmer-copy truncate text-foreground">{{ text }}</span>
    </span>
  </span>
</template>
