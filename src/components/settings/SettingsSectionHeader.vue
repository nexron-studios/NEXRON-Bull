<script setup lang="ts">
// The head of a settings section: its title and what it is for, actions on the right. On a phone
// the screen's own bar carries the title, so only the description stays.
const { isPhone = false } = defineProps<{
  title: string
  description: string
  isPhone?: boolean
}>()
</script>

<template>
  <header class="flex items-start justify-between gap-4">
    <div class="flex max-w-2xl min-w-0 flex-1 flex-col gap-1">
      <h1 v-if="!isPhone" class="text-display font-semibold" data-route-title>{{ title }}</h1>
      <p class="text-small text-muted-foreground">{{ description }}</p>
    </div>
    <slot />
  </header>
</template>
