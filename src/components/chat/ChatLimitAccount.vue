<script setup lang="ts">
import { computed } from 'vue'
import { useMinuteClock } from '@/composables/useClock'
import { useI18n } from 'vue-i18n'
import type { AccountRefProps } from '@/types/agentd.type'
import { resetOf } from '@/utils/limits'
import { ALL_PERCENT, leftPercentOf, percentWidth } from '@/utils/percent'
import { METER_LEVEL_CLASS, meterLevelOf } from '@/utils/quota'

// One account on a limit card: name, a short meter and what it means (full until, or free).
const { account, isFull = false } = defineProps<{ account: AccountRefProps; isFull?: boolean }>()

const { t, locale } = useI18n()
const now = useMinuteClock()

const used = computed(() => (isFull ? ALL_PERCENT : (account.used_percent ?? 0)))
const fillClass = computed(() => METER_LEVEL_CLASS[meterLevelOf(used.value)].fill)
const note = computed(() => {
  if (isFull) {
    const reset = resetOf(account.resets_at_ms, now.value.getTime(), locale.value)
    return reset ? t('chat.limit.full_until', { at: reset.at }) : t('chat.limit.full')
  }
  if (account.used_percent === null) return ''
  return t('chat.limit.free', { percent: Math.round(leftPercentOf(account.used_percent)) })
})
</script>

<template>
  <span class="flex min-w-0 items-center gap-2 text-small">
    <span class="font-semibold">{{ account.label }}</span>
    <span class="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span
        class="block h-full rounded-full"
        :class="fillClass"
        :style="{ width: percentWidth(leftPercentOf(used)) }"
      />
    </span>
    <span
      class="text-meta tabular-nums"
      :class="isFull ? 'text-critical' : 'text-muted-foreground'"
    >
      {{ note }}
    </span>
  </span>
</template>
