<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UsageQuotaBar from '@/components/usage/UsageQuotaBar.vue'
import { useUsageFormat } from '@/composables/useUsageFormat'
import type { QuotaWindow } from '@/types/agentd.type'
import { leftPercentOf } from '@/utils/percent'
import { METER_LEVEL_CLASS, meterLevelOf } from '@/utils/quota'

// One quota window of an account card: name, bar, percentage (Figma "22").
defineProps<{ window: QuotaWindow }>()

const { t } = useI18n()
const format = useUsageFormat()
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-2 text-meta tabular-nums">
    <span class="shrink-0 text-muted-foreground">{{ t(`usage.windows.${window.key}`) }}</span>
    <UsageQuotaBar
      :label="t(`usage.windows.${window.key}`)"
      :used-percent="window.used_percent"
      class="min-w-12 flex-1"
    />
    <span
      class="w-10 shrink-0 text-right"
      :class="METER_LEVEL_CLASS[meterLevelOf(window.used_percent)].text"
      >{{ format.usedPercent(leftPercentOf(window.used_percent)) }}</span
    >
  </div>
</template>
