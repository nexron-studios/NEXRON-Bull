<script setup lang="ts">
// One line of a ranked list in the overview: name, a neutral bar for the share of the biggest
// entry, the value. One series, so the bar carries no colour (dataviz: colour has no job here).
defineProps<{
  /** 0…1 of the biggest entry in the list */
  share: number
  value: string
  /** Muted text before the bar, such as a session count */
  note?: string
}>()
</script>

<template>
  <li class="grid grid-cols-[minmax(0,9rem)_auto_minmax(3rem,1fr)_4.5rem] items-center gap-3">
    <span class="flex min-w-0 items-center gap-2 font-mono text-small">
      <slot />
    </span>
    <span class="text-meta whitespace-nowrap text-muted-foreground tabular-nums">{{ note }}</span>
    <span class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span
        class="block h-full rounded-full bg-muted-foreground"
        :style="{ width: `${Math.max(share * 100, 2)}%` }"
      />
    </span>
    <span class="text-right text-small font-medium tabular-nums">{{ value }}</span>
  </li>
</template>
