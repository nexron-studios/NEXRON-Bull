<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  modelLabelOf,
  tokenCountFormatterOf,
  turnDurationOf,
  type TurnStats
} from '@/utils/turnStats'

// What a finished turn took, under its answer: "Gearbeitet 4:12 min · 18,2k Tokens · Opus 5.5".
const { stats } = defineProps<{ stats: TurnStats }>()

const { t, locale } = useI18n()

const formatTokens = computed(() => tokenCountFormatterOf(locale.value))
const parts = computed(() => {
  const duration = stats.durationMs === null ? null : turnDurationOf(stats.durationMs)
  return [
    duration && t('chat.turn.worked', { duration: t(`chat.turn.${duration.unit}`, duration) }),
    stats.outputTokens > 0 && t('chat.turn.tokens', { n: formatTokens.value(stats.outputTokens) }),
    stats.model && modelLabelOf(stats.model)
  ].filter((part): part is string => !!part)
})
</script>

<template>
  <p v-if="parts.length" class="text-small text-muted-foreground tabular-nums">
    {{ parts.join(' · ') }}
  </p>
</template>
