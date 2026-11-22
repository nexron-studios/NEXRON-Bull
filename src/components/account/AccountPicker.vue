<script setup lang="ts">
import { computed } from 'vue'
import { Check, Info } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AccountDot from '@/components/account/AccountDot.vue'
import AccountPlan from '@/components/account/AccountPlan.vue'
import { Skeleton } from '@/components/ui/skeleton'
import UsageQuotaBar from '@/components/usage/UsageQuotaBar.vue'
import { useProfiles } from '@/composables/useAgentdCatalog'
import { useQuota } from '@/composables/useQuota'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { useAccountSettingsStore } from '@/stores/accountSettings'
import { useChatStore } from '@/stores/chat'
import type { ProfileProps } from '@/types/agentd.type'
import type { ChatTabState } from '@/utils/chatTab'
import {
  accountKeyOf,
  freePercentOf,
  planLabelOf,
  problemKeyOf,
  quotaOfProfile,
  windowOf
} from '@/utils/quota'
import { leftPercentOf } from '@/utils/percent'

// Every account on the tab's machine with its 5-hour and week quota (Figma "17", "M11"). Picking
// one moves this chat there: stop, copy the session, continue.
const { tab } = defineProps<{ tab: ChatTabState }>()
const emit = defineEmits<{ picked: [] }>()

const { t } = useI18n()
const chat = useChatStore()
const format = useUsageFormat()
const profiles = useProfiles(() => tab.machine)
const { profiles: quotas, isPending: isQuotaPending } = useQuota()
const accountSettings = useAccountSettingsStore()

// The default profile is `null` in a tab but has a folder in the profile list.
const currentDir = computed(
  () =>
    tab.profile ?? profiles.data.value?.find((profile) => profile.label === 'default')?.dir ?? ''
)
// Moving needs a session on disk, and Claude must not be starting while it is copied.
const canSwitch = computed(() => !!tab.sessionId && tab.status !== 'starting')

// Accounts switched off in the settings are not offered; the chat's own one stays listed.
const rows = computed(() =>
  (profiles.data.value ?? [])
    .filter(
      (profile) =>
        profile.dir === currentDir.value || accountSettings.isOfferedOn(tab.machine, profile.dir)
    )
    .map((profile) => {
      const quota = quotaOfProfile(quotas.value, tab.machine, profile.dir)
      return {
        profile,
        key: accountKeyOf({ email: profile.email, machine: tab.machine, profile: profile.dir }),
        quota,
        plan: planLabelOf(quota?.plan ?? null),
        isCurrent: profile.dir === currentDir.value,
        // Claude would not start there; the row says why.
        isLoggedOut: quota?.problem === 'logged_out',
        free: quota ? freePercentOf(quota) : null,
        windows: quota
          ? [windowOf(quota, 'five_hour'), windowOf(quota, 'seven_day')].flatMap((w) => w ?? [])
          : []
      }
    })
)

const pick = (profile: ProfileProps) => {
  if (profile.dir === currentDir.value || !canSwitch.value) return
  emit('picked')
  void chat.switchAccount(tab.id, profile)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div v-if="profiles.isPending.value" class="flex flex-col gap-2 p-1" :aria-busy="true">
      <Skeleton v-for="n in 2" :key="n" class="h-12 rounded-lg" />
      <span class="sr-only">{{ t('account.loading') }}</span>
    </div>
    <ul v-else class="flex flex-col gap-1">
      <li v-for="row in rows" :key="row.profile.dir">
        <button
          type="button"
          class="flex w-full touch-manipulation items-start gap-3 rounded-lg p-2.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent"
          :class="{ 'bg-muted disabled:hover:bg-muted': row.isCurrent }"
          :aria-current="row.isCurrent ? 'true' : undefined"
          :disabled="!row.isCurrent && (!canSwitch || row.isLoggedOut)"
          @click="pick(row.profile)"
        >
          <AccountDot :account-key="row.key" class="mt-1.5" />
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="flex items-center justify-between gap-2">
              <span class="flex min-w-0 items-center gap-2">
                <span class="truncate text-small font-semibold">{{ row.profile.label }}</span>
                <AccountPlan v-if="row.plan" :plan="row.plan" />
              </span>
              <Check
                v-if="row.isCurrent"
                class="size-4 shrink-0"
                :aria-label="t('account.current')"
              />
              <span v-else-if="row.free !== null" class="shrink-0 text-meta text-muted-foreground">
                {{ t('account.free', { percent: format.usedPercent(row.free) }) }}
              </span>
            </span>
            <span
              v-if="row.windows.length"
              class="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground tabular-nums"
            >
              <span v-for="window in row.windows" :key="window.key" class="flex items-center gap-2">
                <span class="whitespace-nowrap"
                  >{{ t(`usage.windows.${window.key}`) }}
                  {{ format.usedPercent(leftPercentOf(window.used_percent)) }}</span
                >
                <UsageQuotaBar
                  :label="t(`usage.windows.${window.key}`)"
                  :used-percent="window.used_percent"
                  is-on-popover
                  class="h-1 w-14"
                />
              </span>
            </span>
            <Skeleton v-else-if="isQuotaPending" class="h-3 w-40" />
            <span v-else-if="row.quota?.problem" class="text-meta text-muted-foreground">
              {{ t(problemKeyOf(row.quota.problem, row.quota.source)) }}
            </span>
          </span>
        </button>
      </li>
    </ul>
    <p
      class="flex items-start gap-2 border-t border-border px-2.5 pt-2.5 text-meta text-muted-foreground"
    >
      <Info class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {{ canSwitch ? t('account.hint') : t('account.unavailable') }}
    </p>
  </div>
</template>
