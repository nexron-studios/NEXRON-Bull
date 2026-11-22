<script setup lang="ts">
import { computed } from 'vue'
import { Server } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import NchRangeSwitch from '@/components/common/NchRangeSwitch.vue'
import SettingsLimitOrder from '@/components/settings/SettingsLimitOrder.vue'
import SettingsLimitRules from '@/components/settings/SettingsLimitRules.vue'
import SettingsSectionHeader from '@/components/settings/SettingsSectionHeader.vue'
import SettingsSwitchRow from '@/components/settings/SettingsSwitchRow.vue'
import { useSettingsAccounts } from '@/composables/useSettingsAccounts'
import { useLimitPolicyStore } from '@/stores/limitPolicy'
import { limitModeList, type LimitMode } from '@/types/agentd.type'
import { limitAccountsOf, orderedAccountsOf } from '@/utils/limitPolicy'

// What happens when an account hits its plan limit (Figma "27", "M27"): move the chat, ask, or
// wait for the reset. agentd on every machine decides with it; `useLimitPolicySync` hands it over.
const { isPhone = false } = defineProps<{ isPhone?: boolean }>()

const { t } = useI18n()
const store = useLimitPolicyStore()
const { policy, notifyQueueSent } = storeToRefs(store)
const { groups } = useSettingsAccounts()

const modeOptions = computed(() =>
  limitModeList.map((value) => ({
    value,
    label: t(`settings.limits.modes.${value}`),
    shortLabel: t(`settings.limits.modes_short.${value}`)
  }))
)
const mode = computed({
  get: () => policy.value.mode,
  set: (value: LimitMode) => store.setMode(value)
})
const suggestEarly = computed({
  get: () => policy.value.suggest_early,
  set: (value: boolean) => store.setSuggestEarly(value)
})
const queue = computed({
  get: () => policy.value.queue,
  set: (value: boolean) => store.setQueue(value)
})
const accounts = computed(() => limitAccountsOf(groups.value))
const ordered = computed(() => orderedAccountsOf(accounts.value, policy.value.order))
// Each machine lists its accounts on its own; until this one answered there is nothing to order.
const isLoading = computed(() => groups.value.some((group) => group.state === 'loading'))
</script>

<template>
  <SettingsSectionHeader
    :title="t('settings.sections.limits')"
    :description="t('settings.limits.description')"
    :is-phone
  />

  <!-- The two short settings share a row once both fit; the rule table below gets the full width
       its columns need. -->
  <div class="grid grid-cols-1 gap-4 @4xl:grid-cols-2">
    <section
      class="@container flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
      aria-labelledby="limit-move"
    >
      <h2 id="limit-move" class="text-small font-semibold">
        {{ isPhone ? t('settings.limits.when_full') : t('settings.limits.move_title') }}
      </h2>
      <div class="flex flex-col gap-2 @md:flex-row @md:items-center @md:gap-3">
        <span v-if="!isPhone" class="flex-1 text-small text-muted-foreground">
          {{ t('settings.limits.when_full') }}
        </span>
        <NchRangeSwitch
          v-model="mode"
          :options="modeOptions"
          :label="t('settings.limits.when_full')"
          :class="{ 'w-full *:min-h-9 *:flex-1': isPhone }"
        />
      </div>
      <SettingsSwitchRow
        v-model="suggestEarly"
        :title="t('settings.limits.suggest_early')"
        :hint="t('settings.limits.suggest_early_hint')"
      />
      <SettingsLimitOrder :accounts="ordered" :is-loading @reorder="store.setOrder" />
    </section>

    <section
      class="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
      aria-labelledby="limit-queue"
    >
      <h2 id="limit-queue" class="text-small font-semibold">
        {{ t('settings.limits.queue_title') }}
      </h2>
      <SettingsSwitchRow
        v-model="queue"
        :title="t('settings.limits.queue')"
        :hint="t('settings.limits.queue_hint')"
      />
      <SettingsSwitchRow
        v-model="notifyQueueSent"
        :title="t('settings.limits.notify_queue_sent')"
        :hint="t('settings.limits.notify_queue_sent_hint')"
      />
      <p class="flex items-start gap-2 text-meta text-muted-foreground">
        <Server class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {{ t('settings.limits.queue_note') }}
      </p>
    </section>
  </div>

  <SettingsLimitRules :accounts="ordered" :is-phone />
</template>
