<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AccountDot from '@/components/account/AccountDot.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import SessionQueuePopover from '@/components/session/SessionQueuePopover.vue'
import UsageQuotaBar from '@/components/usage/UsageQuotaBar.vue'
import { useMinuteClock } from '@/composables/useClock'
import { useQuota } from '@/composables/useQuota'
import { useResetText } from '@/composables/useResetText'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { useChatStore } from '@/stores/chat'
import { waitingTabsOf } from '@/utils/limits'
import { leftPercentOf } from '@/utils/percent'
import {
  METER_LEVEL_CLASS,
  accountKeyOf,
  meterLevelOf,
  problemKeyOf,
  windowOf
} from '@/utils/quota'

// Bottom of the sidebar (Figma "10 · Fassung 5"): per profile a line with its name, below it the
// 5 hours and the week side by side, each with its reset underneath. Two profiles on one email
// keep their own lines (same numbers), so every profile a chat can start on is visible.
// Switching happens per chat, so there is no account switch here.

const { t } = useI18n()
const format = useUsageFormat()
const now = useMinuteClock()
const resetTextOf = useResetText()
const { offeredProfiles, isPending } = useQuota()
const chat = useChatStore()

const meterOf = (used: number | null, reset: string | null, label: string, name: string) => ({
  label,
  reset,
  meterLabel: name,
  used,
  text: used === null ? t('sidebar.quota_none') : format.value.usedPercent(leftPercentOf(used)),
  textClass: METER_LEVEL_CLASS[meterLevelOf(used ?? 0)].text
})

// An account without numbers (rate limited, logged out) keeps its line; the tooltip says why.
const rows = computed(() =>
  offeredProfiles.value.map((account) => {
    const fiveHour = windowOf(account, 'five_hour')
    const week = windowOf(account, 'seven_day')
    const at = now.value.getTime()
    return {
      key: `${account.machine ?? ''}:${account.profile}`,
      label: account.label,
      accountKey: accountKeyOf(account),
      waiting: waitingTabsOf(chat.tabs, account.machine ?? null, account.label),
      details: fiveHour
        ? null
        : account.problem && t(problemKeyOf(account.problem, account.source)),
      meters: [
        meterOf(
          fiveHour?.used_percent ?? null,
          fiveHour && resetTextOf(fiveHour.resets_at, at),
          t('sidebar.quota_five_hour'),
          t('sidebar.quota_line', { account: account.label })
        ),
        meterOf(
          week?.used_percent ?? null,
          week && resetTextOf(week.resets_at, at),
          t('sidebar.quota_week'),
          t('sidebar.quota_week_line', { account: account.label })
        )
      ]
    }
  })
)
</script>

<template>
  <section
    v-if="rows.length || isPending"
    class="shrink-0 border-t border-border px-4 py-3"
    :aria-label="t('sidebar.quota_label')"
  >
    <ul v-if="rows.length" class="flex flex-col gap-2.5">
      <li v-for="row in rows" :key="row.key">
        <Tooltip>
          <TooltipTrigger as-child>
            <div
              :tabindex="row.details ? 0 : undefined"
              class="flex flex-col gap-1 rounded-sm text-meta outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span class="flex items-center gap-2">
                <AccountDot :account-key="row.accountKey" />
                <span class="min-w-0 flex-1 truncate text-subtle">{{ row.label }}</span>
                <SessionQueuePopover
                  v-if="row.waiting.length"
                  :tabs="row.waiting"
                  :account="row.label"
                />
              </span>
              <span class="flex items-start gap-3">
                <span
                  v-for="meter in row.meters"
                  :key="meter.label"
                  class="flex min-w-0 flex-1 flex-col gap-0.5"
                >
                  <span class="flex min-w-0 items-center gap-1.5">
                    <span class="shrink-0 text-muted-foreground">{{ meter.label }}</span>
                    <UsageQuotaBar
                      v-if="meter.used !== null"
                      :label="meter.meterLabel"
                      :used-percent="meter.used"
                      class="min-w-4 flex-1"
                    />
                    <span
                      v-else
                      class="h-1.5 min-w-4 flex-1 rounded-full bg-muted"
                      aria-hidden="true"
                    />
                    <span class="w-8 shrink-0 text-right tabular-nums" :class="meter.textClass">
                      {{ meter.text }}
                    </span>
                  </span>
                  <span v-if="meter.reset" class="truncate text-muted-foreground tabular-nums">
                    {{ meter.reset }}
                  </span>
                </span>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent v-if="row.details" side="right">{{ row.details }}</TooltipContent>
        </Tooltip>
      </li>
    </ul>
    <div v-else class="flex flex-col gap-2" aria-busy="true">
      <Skeleton v-for="n in 2" :key="n" class="h-9 w-full" />
      <span class="sr-only">{{ t('sidebar.quota_loading') }}</span>
    </div>
  </section>
</template>
