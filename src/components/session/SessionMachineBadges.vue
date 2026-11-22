<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MachineActivity } from '@/utils/sessionList'

// The dot for what a machine's tabs are up to and the pill with their count, shared by the
// machine segments and the machine picker. `stateLabel` is what a screen reader hears for the dot.
const {
  state = null,
  stateLabel = '',
  count = 0
} = defineProps<{
  state?: MachineActivity | null
  stateLabel?: string
  count?: number
}>()

const { t } = useI18n()

const DOT_CLASS = { needs: 'bg-critical', running: 'bg-warning', done: 'bg-good' } as const
</script>

<template>
  <span
    v-if="state"
    class="size-1.5 shrink-0 rounded-full"
    :class="DOT_CLASS[state]"
    aria-hidden="true"
  />
  <span v-if="state" class="sr-only">{{ stateLabel }}</span>
  <span
    v-if="count"
    class="shrink-0 rounded-full bg-foreground/10 px-1.5 text-meta text-muted-foreground tabular-nums"
  >
    <span aria-hidden="true">{{ count }}</span>
    <span class="sr-only">{{ t('sidebar.tab_count', count) }}</span>
  </span>
</template>
