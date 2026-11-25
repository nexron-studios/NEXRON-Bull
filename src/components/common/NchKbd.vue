<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

// A key hint ("1", "Esc"). Only where a keyboard is likely: a touch screen has none to press.
// `isOnFill`: inside a filled button (brand or primary), where the muted border and text would
// vanish; it takes the button's own text colour.
const {
  keyLabel,
  isOnFill = false,
  class: className = ''
} = defineProps<{
  keyLabel: string
  isOnFill?: boolean
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <kbd
    :class="
      cn(
        'inline-grid h-4.5 min-w-4.5 shrink-0 place-items-center rounded border px-1 font-sans text-meta leading-none whitespace-nowrap pointer-coarse:hidden',
        isOnFill ? 'border-current/40 text-current/80' : 'border-border text-muted-foreground',
        className
      )
    "
    aria-hidden="true"
    >{{ keyLabel }}</kbd
  >
</template>
