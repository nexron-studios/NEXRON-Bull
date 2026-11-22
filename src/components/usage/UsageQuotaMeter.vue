<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import UsageQuotaBar from '@/components/usage/UsageQuotaBar.vue'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { leftPercentOf } from '@/utils/percent'
import { METER_LEVEL_CLASS, meterLevelOf } from '@/utils/quota'

const {
  label,
  usedPercent,
  reset = null
} = defineProps<{
  label: string
  usedPercent: number
  /** `Reset 3:59 h`, next to the label */
  reset?: string | null
}>()

const { t } = useI18n()
const format = useUsageFormat()

const level = computed(() => meterLevelOf(usedPercent))
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2 text-small text-muted-foreground">
      <span class="flex min-w-0 items-baseline gap-1.5">
        <span class="min-w-0 truncate">{{ label }}</span>
        <span v-if="reset" class="shrink-0 tabular-nums">· {{ reset }}</span>
      </span>
      <span class="flex shrink-0 items-center gap-1 tabular-nums">
        <TriangleAlert
          v-if="level !== 'normal'"
          class="size-3.5"
          :class="METER_LEVEL_CLASS[level].text"
          :aria-label="t('usage.near_limit')"
        />
        {{ format.usedPercent(leftPercentOf(usedPercent)) }}
      </span>
    </div>
    <UsageQuotaBar :label :used-percent />
  </div>
</template>
