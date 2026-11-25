<script setup lang="ts">
import { ref } from 'vue'
import { isDesktopApp } from '@/lib/platform'
import { toast } from 'vue-sonner'
import { Monitor, Plus, Server, ServerOff, UserRound } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useMachineNames } from '@/composables/useMachineNames'
import type { Machine } from '@/api/services/agentd.service'
import NchEmpty from '@/components/common/NchEmpty.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import SettingsAccountCard from '@/components/settings/SettingsAccountCard.vue'
import SettingsAddAccountDialog from '@/components/settings/SettingsAddAccountDialog.vue'
import SettingsLoginDialog from '@/components/settings/SettingsLoginDialog.vue'
import SettingsSectionHeader from '@/components/settings/SettingsSectionHeader.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useHasOtherMachines } from '@/composables/useAgentdCatalog'
import { useSettingsAccounts } from '@/composables/useSettingsAccounts'
import type { ProfileProps } from '@/types/agentd.type'
import { accountsHeadingIdOf } from '@/utils/accountCards'

// The accounts Bull offers, per machine (Figma "22", "M23"): this PC first, then every SSH host.
// Removed ones come back through "Add account › Already logged in".
const { isPhone = false } = defineProps<{ isPhone?: boolean }>()

const isAddOpen = ref(false)
const isLoginOpen = ref(false)
const loginTarget = ref<{ machine: Machine; profile: ProfileProps } | null>(null)

const { t } = useI18n()
const { nameOf } = useMachineNames()
const { groups, refetch } = useSettingsAccounts()
// With this PC alone its heading names nothing to tell apart; screen readers still get it.
const hasOtherMachines = useHasOtherMachines()

const SKELETON_CARDS = 2
// Logging in runs `claude /login` in a terminal of the app window; a browser has none.
const canLogIn = isDesktopApp()

const askLogin = (machine: Machine, profile: ProfileProps) => {
  if (!canLogIn) return void toast.info(t('terminal.desktop_only'))
  loginTarget.value = { machine, profile }
  isLoginOpen.value = true
}
</script>

<template>
  <SettingsSectionHeader
    :title="t('settings.sections.accounts')"
    :description="t('settings.accounts.description')"
    :is-phone
  >
    <template v-if="canLogIn">
      <NchIconButton
        v-if="isPhone"
        :label="t('settings.accounts.add')"
        size="icon-lg"
        class="bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
        aria-haspopup="dialog"
        @click="isAddOpen = true"
      >
        <Plus class="size-5" aria-hidden="true" />
      </NchIconButton>
      <Button
        v-else
        class="bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
        aria-haspopup="dialog"
        @click="isAddOpen = true"
      >
        <Plus class="size-4" aria-hidden="true" />
        {{ t('settings.accounts.add') }}
      </Button>
    </template>
  </SettingsSectionHeader>

  <!-- Each machine is a column once two fit, so a host's accounts show without scrolling past
       this PC's; a single machine takes the whole width. Columns share a height, so an empty
       or failed machine fills the room beside its neighbour's cards. -->
  <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))] gap-x-6 gap-y-4">
    <section
      v-for="group in groups"
      :key="group.machine ?? ''"
      class="flex min-w-0 flex-col gap-2.5"
      :aria-labelledby="accountsHeadingIdOf(group.machine)"
    >
      <h2
        :id="accountsHeadingIdOf(group.machine)"
        tabindex="-1"
        class="mt-2 flex items-center gap-2 text-small font-semibold text-muted-foreground outline-none"
        :class="!hasOtherMachines && 'sr-only'"
      >
        <component
          :is="group.machine === null ? Monitor : Server"
          class="size-4"
          aria-hidden="true"
        />
        {{ nameOf(group.machine) }}
        <span
          v-if="group.state === 'ready'"
          class="rounded-md bg-muted px-1.5 text-meta leading-5 font-medium tabular-nums"
          >{{ group.offeredCards.length }}</span
        >
      </h2>
      <template v-if="group.state === 'loading'">
        <span class="sr-only" role="status">{{
          t('settings.accounts.loading', { machine: nameOf(group.machine) })
        }}</span>
        <Skeleton v-for="n in SKELETON_CARDS" :key="n" class="h-24 rounded-xl" />
      </template>
      <NchEmpty
        v-else-if="group.state === 'failed'"
        :icon="ServerOff"
        :title="t('settings.machines.accounts_failed_title')"
        :hint="
          t('settings.accounts.machine_failed', {
            machine: nameOf(group.machine)
          })
        "
        size="sm"
        class="motion-shake rounded-xl border border-dashed border-border"
      >
        <Button variant="outline" size="sm" class="motion-press" @click="refetch()">
          {{ t('settings.accounts.retry') }}
        </Button>
      </NchEmpty>
      <NchEmpty
        v-else-if="!group.offeredCards.length"
        :icon="UserRound"
        :title="t('settings.sections.accounts')"
        :hint="t('settings.accounts.empty')"
        size="sm"
        class="rounded-xl border border-dashed border-border"
      />
      <SettingsAccountCard
        v-for="(card, index) in group.offeredCards"
        v-else
        :key="card.profile.dir"
        :card
        class="motion-stagger"
        :style="{ '--stagger-index': index }"
        @login="askLogin(group.machine, card.profile)"
      />
    </section>
  </div>

  <SettingsAddAccountDialog v-if="canLogIn" v-model:open="isAddOpen" :groups />
  <SettingsLoginDialog
    v-if="canLogIn && loginTarget"
    v-model:open="isLoginOpen"
    :machine="loginTarget.machine"
    :profile="loginTarget.profile"
  />
</template>
