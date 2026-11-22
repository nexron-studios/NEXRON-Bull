<script setup lang="ts">
// One place the accent shows up, with its name below (Figma 22f "Färbt sich mit").
defineProps<{ label: string }>()
</script>

<template>
  <li
    class="flex min-w-0 flex-col items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5"
  >
    <!-- Fixed height of the tallest preview (taskbar icon), so every preview centers on one line. -->
    <span class="flex h-11 max-w-full min-w-0 items-center justify-center" aria-hidden="true">
      <slot />
    </span>
    <span class="text-meta text-muted-foreground">{{ label }}</span>
  </li>
</template>
