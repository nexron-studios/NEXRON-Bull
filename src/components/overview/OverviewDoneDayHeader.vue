<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDays } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import { dayKindOf } from '@/utils/finishedList'

// The heading of one day in the "done" list. It sticks below the list's bar while the day's rows
// scroll under it, on the translucent material surface, like the sidebar's group headings.
const { day, now, count } = defineProps<{
  /** Start of the day, in ms */
  day: number
  now: number
  /** Every row of the day, also those not rendered yet */
  count: number
  headingId: string
  /** Stuck below the list's bar with rows scrolling beneath it: it casts the edge */
  isStuck: boolean
}>()

const { t, locale } = useI18n()

const label = computed(() => {
  const kind = dayKindOf(day, now)
  switch (kind) {
    case 'today':
    case 'yesterday':
      return t(`overview.done_days.${kind}`)
    case 'this_year':
    case 'older':
      return new Intl.DateTimeFormat(locale.value, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: kind === 'older' ? 'numeric' : undefined
      }).format(day)
    default: {
      const unhandled: never = kind
      throw new Error(`Unhandled day kind: ${unhandled}`)
    }
  }
})
</script>

<template>
  <div
    class="sticky top-(--done-bar-height) z-10 -mx-1 flex items-center material px-1 pt-3 pb-1.5"
  >
    <h3
      :id="headingId"
      class="flex min-w-0 items-center gap-2 text-meta font-medium text-muted-foreground"
    >
      <CalendarDays class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{{ label }}</span>
      <span class="rounded-full bg-muted px-1.5 text-subtle tabular-nums">{{ count }}</span>
    </h3>
    <NchScrollEdge edge="below" :is-shown="isStuck" />
  </div>
</template>
