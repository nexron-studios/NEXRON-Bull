<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { useIntervalFn, useNow } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { secondsUntil, type ApiRetry } from '@/utils/apiRetry'
import { MS_PER_SECOND } from '@/utils/elapsed'
import { glowClassOf } from '@/theme/glow'

// Claude Code asks Anthropic again after an API error (Figma "36"): why, when, which attempt.
// No "try now": headless Claude Code offers no way to cut its wait short.
const { retry } = defineProps<{ retry: ApiRetry }>()

const { t } = useI18n()
const now = useNow({ scheduler: (tick) => useIntervalFn(tick, MS_PER_SECOND) })

const seconds = computed(() => secondsUntil(retry.retriesAt, now.value.getTime()))
const detail = computed(() =>
  [
    seconds.value ? t('chat.retry.in', { seconds: seconds.value }) : t('chat.retry.now'),
    t('chat.retry.attempt', { attempt: retry.attempt, max: retry.maxRetries }),
    retry.status !== null && t('chat.retry.status', { status: retry.status })
  ]
    .filter((part): part is string => !!part)
    .join(' · ')
)
</script>

<template>
  <div
    :class="glowClassOf('warning')"
    class="flex w-full max-w-[72ch] items-center gap-3 rounded-xl px-3 py-2"
  >
    <RefreshCw class="size-4 shrink-0 text-warning" aria-hidden="true" />
    <div class="flex min-w-0 flex-col">
      <span class="text-small font-semibold" aria-live="polite">{{
        t(`chat.retry.${retry.reason}`)
      }}</span>
      <span class="text-meta text-muted-foreground tabular-nums">{{ detail }}</span>
    </div>
  </div>
</template>
