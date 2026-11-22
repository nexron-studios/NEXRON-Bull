<script setup lang="ts">
import { Check } from '@lucide/vue'
import BrandBullLogo from '@/components/brand/BrandBullLogo.vue'

// One colour scheme as a card (Figma 22f): the bull on a tile in the accent, a bar in it, and the
// accent with its two neighbours as dots. `--brand` is scoped to the card, so the bull shows the
// scheme's accent, not the active one.
const {
  label,
  note = '',
  accent,
  side = [],
  isSelected = false
} = defineProps<{
  label: string
  note?: string
  accent: string
  side?: readonly string[]
  isSelected?: boolean
}>()

const emit = defineEmits<{ pick: [] }>()
</script>

<template>
  <button
    type="button"
    :aria-pressed="isSelected"
    :style="{ '--brand': accent }"
    class="motion-press flex min-w-0 touch-manipulation flex-col gap-2 rounded-lg border border-border p-2.5 text-left transition-[color,background-color,border-color,transform] duration-150 ease-out outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-brand aria-pressed:bg-muted"
    @click="emit('pick')"
  >
    <span class="flex h-10 items-center gap-2 rounded-md bg-background px-2" aria-hidden="true">
      <span class="grid size-7 shrink-0 place-items-center rounded-md bg-muted">
        <BrandBullLogo :size="18" />
      </span>
      <span class="flex min-w-0 grow flex-col gap-1">
        <span class="block h-1.5 w-[70%] rounded-full bg-brand" />
        <span class="block h-1.5 w-[46%] rounded-full bg-accent" />
      </span>
      <span class="flex shrink-0 gap-1">
        <span
          v-for="(color, index) in [accent, ...side]"
          :key="index"
          class="size-2.5 rounded-full"
          :style="{ backgroundColor: color }"
        />
      </span>
    </span>
    <span class="flex min-w-0 items-center justify-between gap-2">
      <span class="truncate text-small" :class="{ 'font-semibold': isSelected }">{{ label }}</span>
      <Check v-if="isSelected" class="size-3.5 shrink-0" aria-hidden="true" />
      <span v-else-if="note" class="shrink-0 text-meta text-muted-foreground">{{ note }}</span>
    </span>
  </button>
</template>
