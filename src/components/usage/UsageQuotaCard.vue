<script setup lang="ts">
import { computed } from 'vue'
import { CircleAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AccountPlan from '@/components/account/AccountPlan.vue'
import UsageQuotaMeter from '@/components/usage/UsageQuotaMeter.vue'
import { useResetText } from '@/composables/useResetText'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { planLabelOf, problemKeyOf, shownProblemOf, type MachineQuota } from '@/utils/quota'

const { quota, now } = defineProps<{ quota: MachineQuota; now: number }>()

const { t } = useI18n()
const format = useUsageFormat()
const resetTextOf = useResetText()

const plan = computed(() => planLabelOf(quota.plan))
// Every window says when it resets; an unused 5-hour window has no reset time yet.
const meters = computed(() =>
  quota.windows.map((window) => ({ ...window, reset: resetTextOf(window.resets_at, now) }))
)
const problem = computed(() => shownProblemOf(quota, now))
const staleSince = computed(() =>
  problem.value && quota.fetched_ms
    ? t('usage.stale_since', { time: format.value.time(quota.fetched_ms) })
    : null
)
</script>

<template>
  <article class="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
    <header class="flex min-w-0 flex-col">
      <h3 class="flex min-w-0 items-center gap-2 text-body font-semibold">
        <span class="truncate">{{ quota.label }}</span>
        <AccountPlan v-if="plan" :plan />
      </h3>
      <span v-if="quota.machine" class="truncate text-meta text-muted-foreground">
        {{ t('usage.on_machine', { machine: quota.machine }) }}
      </span>
    </header>
    <UsageQuotaMeter
      v-for="meter in meters"
      :key="meter.key"
      :label="t(`usage.windows.${meter.key}`)"
      :used-percent="meter.used_percent"
      :reset="meter.reset"
    />
    <p v-if="problem" class="flex items-start gap-1.5 text-small text-muted-foreground">
      <CircleAlert class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <span>
        {{ t(problemKeyOf(problem, quota.source)) }}
        <template v-if="staleSince"> {{ staleSince }}</template>
      </span>
    </p>
    <p v-if="quota.source" class="text-meta text-muted-foreground">
      {{ t('usage.source', { source: t(`usage.sources.${quota.source}`) }) }}
    </p>
  </article>
</template>
