<script setup lang="ts">
import { useId } from 'vue'
import type { Component } from 'vue'

// One block of the panel right of the chat: an icon and title like the account row above, something
// next to them, the content.
const { icon, title } = defineProps<{ icon: Component; title: string }>()

const headingId = useId()
</script>

<template>
  <section class="flex flex-col gap-3" :aria-labelledby="headingId">
    <div class="flex min-h-5 items-center justify-between gap-2 select-none">
      <h2 :id="headingId" class="flex min-w-0 items-center gap-2 text-small font-semibold">
        <component :is="icon" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {{ title }}
      </h2>
      <slot name="aside" />
    </div>
    <slot />
  </section>
</template>
