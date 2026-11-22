<script setup lang="ts">
import { computed } from 'vue'
import { ChartColumn, ChevronRight } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import PanelSection from '@/components/panel/PanelSection.vue'
import { Skeleton } from '@/components/ui/skeleton'
import UsageQuotaMeter from '@/components/usage/UsageQuotaMeter.vue'
import { useMinuteClock } from '@/composables/useClock'
import { useQuota } from '@/composables/useQuota'
import { useResetText } from '@/composables/useResetText'
import type { ChatTabState } from '@/utils/chatTab'
import { problemKeyOf, quotaOfProfile, shownProblemOf, windowOf } from '@/utils/quota'

// The 5-hour window and the week of the account this chat runs on, with the time to the reset.
const { tab } = defineProps<{ tab: ChatTabState }>()

const { t } = useI18n()
const now = useMinuteClock()
const resetTextOf = useResetText()
const { profiles, isPending } = useQuota()

const quota = computed(() => quotaOfProfile(profiles.value, tab.machine, tab.profile))
const meters = computed(() => {
  const account = quota.value
  if (!account) return []
  return [
    {
      window: windowOf(account, 'five_hour'),
      label: t('panel.five_hour_of', { account: tab.account })
    },
    { window: windowOf(account, 'seven_day'), label: t('panel.week_all') }
  ].flatMap(({ window, label }) =>
    window ? [{ ...window, label, reset: resetTextOf(window.resets_at, now.value.getTime()) }] : []
  )
})
const problemKey = computed(() => {
  const account = quota.value
  const problem = account && shownProblemOf(account, now.value.getTime())
  return problem ? problemKeyOf(problem, account.source) : null
})
</script>

<template>
  <PanelSection :icon="ChartColumn" :title="t('panel.usage')">
    <template #aside>
      <RouterLink
        :to="{ name: 'usage' }"
        class="flex items-center gap-0.5 rounded-sm text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {{ t('panel.details') }}
        <ChevronRight class="size-3.5" aria-hidden="true" />
      </RouterLink>
    </template>
    <div v-if="meters.length" class="flex flex-col gap-3">
      <UsageQuotaMeter
        v-for="meter in meters"
        :key="meter.key"
        :label="meter.label"
        :used-percent="meter.used_percent"
        :reset="meter.reset"
      />
    </div>
    <div v-else-if="isPending" class="flex flex-col gap-3">
      <Skeleton v-for="n in 2" :key="n" class="h-8 w-full" />
    </div>
    <p v-if="problemKey" class="text-small text-muted-foreground">
      {{ t(problemKey) }}
    </p>
    <p v-else-if="!meters.length && !isPending" class="text-small text-muted-foreground">
      {{ t('panel.usage_empty') }}
    </p>
  </PanelSection>
</template>
