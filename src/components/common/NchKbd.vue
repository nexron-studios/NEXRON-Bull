<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

// A key hint ("1", "Esc"). Only where a keyboard is likely: a touch screen has none to press.
// `isOnBrand`: inside a brand-filled button, where the muted border and text would vanish.
const {
  keyLabel,
  isOnBrand = false,
  class: className = ''
} = defineProps<{
  keyLabel: string
  isOnBrand?: boolean
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <kbd
    :class="
      cn(
        'inline-grid h-4.5 min-w-4.5 shrink-0 place-items-center rounded border px-1 font-sans text-meta leading-none whitespace-nowrap pointer-coarse:hidden',
        isOnBrand
          ? 'border-brand-foreground/40 text-brand-foreground/80'
          : 'border-border text-muted-foreground',
        className
      )
    "
    aria-hidden="true"
    >{{ keyLabel }}</kbd
  >
</template>
