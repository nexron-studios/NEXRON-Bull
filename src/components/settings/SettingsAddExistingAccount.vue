<script setup lang="ts">
import { computed } from 'vue'
import { Plus, UserRound } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AccountDot from '@/components/account/AccountDot.vue'
import AccountPlan from '@/components/account/AccountPlan.vue'
import NchEmpty from '@/components/common/NchEmpty.vue'
import NchRangeSwitch from '@/components/common/NchRangeSwitch.vue'
import { Button } from '@/components/ui/button'
import type { MachineAccounts } from '@/composables/useSettingsAccounts'
import { useAccountSettingsStore } from '@/stores/accountSettings'
import { accountLabelOf, accountNameOf, folderNameOf, isLoggedOut } from '@/utils/accountCards'

// "Add account > Already logged in" (Figma "22b2"): every profile folder of the machine chosen in
// the dialog that has a login; one Bull does not offer yet comes back with one click, no new login.
const { target } = defineProps<{
  machineOptions: { value: string; label: string }[]
  /** The chosen machine once it answered; `null` while none did */
  target: MachineAccounts | null
  machineName: string
}>()

const machineChoice = defineModel<string>('machineChoice', { required: true })

const { t } = useI18n()
const accountSettings = useAccountSettingsStore()

const cards = computed(() => target?.cards.filter((card) => !isLoggedOut(card)) ?? [])
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="machineOptions.length > 1" class="flex min-w-0 flex-col gap-1.5">
      <span class="text-small font-medium">{{ t('settings.add.machine') }}</span>
      <NchRangeSwitch
        v-model="machineChoice"
        :options="machineOptions"
        :label="t('settings.add.machine')"
      />
    </div>
    <NchEmpty
      v-if="!target"
      :icon="UserRound"
      :title="t('settings.add.existing_waiting_title')"
      :hint="t('settings.add.existing_waiting')"
      size="sm"
      class="rounded-xl border border-dashed border-border"
    />
    <NchEmpty
      v-else-if="!cards.length"
      :icon="UserRound"
      :title="t('settings.add.existing_empty_title')"
      :hint="t('settings.add.existing_empty', { machine: machineName })"
      size="sm"
      class="rounded-xl border border-dashed border-border"
    />
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="card in cards"
        :key="card.profile.dir"
        class="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
      >
        <AccountDot :account-key="card.accountKey" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate font-semibold">{{ accountNameOf(card.profile) }}</span>
            <AccountPlan v-if="card.plan" :plan="card.plan" />
          </div>
          <span class="truncate font-mono text-meta text-muted-foreground">{{
            folderNameOf(card.profile.dir)
          }}</span>
        </div>
        <span v-if="card.isOffered" class="text-meta whitespace-nowrap text-muted-foreground">{{
          t('settings.add.existing_in_bull')
        }}</span>
        <Button
          v-else
          variant="outline"
          size="sm"
          :aria-label="
            t('settings.add.existing_add_label', { account: accountLabelOf(card.profile) })
          "
          @click="accountSettings.setOffered(card.machine, card.profile.dir, true)"
        >
          <Plus class="size-3.5" aria-hidden="true" />
          {{ t('settings.add.existing_add') }}
        </Button>
      </li>
    </ul>
  </div>
</template>
