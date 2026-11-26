<script setup lang="ts">
import { computed, nextTick, type HTMLAttributes } from 'vue'
import { Ellipsis, LogIn, Star, UserMinus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { toast } from '@/lib/toast'
import NchIconButton from '@/components/common/NchIconButton.vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAccountSettingsStore } from '@/stores/accountSettings'
import { accountLabelOf, accountsHeadingIdOf, type AccountCardProps } from '@/utils/accountCards'
import { machineKeyOf } from '@/utils/accountSettings'
import { ACCOUNT_TONE_CLASS, accountToneList, type AccountTone } from '@/utils/quota'

// The "…" of an account: make it the default, log in again, pick its colour, remove it from Bull
// (the folder stays, "Add account › Already logged in" brings it back). Renaming and
// logging out are left out: the folder name is the account everywhere Claude Code shows it, and
// logging out is `claude /logout` in the same terminal as the login.
const { card, triggerClass = '' } = defineProps<{
  card: AccountCardProps
  triggerClass?: HTMLAttributes['class']
}>()
const emit = defineEmits<{ login: [] }>()

const { t } = useI18n()
const accountSettings = useAccountSettingsStore()

const tone = computed({
  get: () => accountSettings.toneOfKey(card.accountKey),
  set: (value: AccountTone) => accountSettings.setTone(card.accountKey, value)
})

const chosenDefaultOn = (machine: AccountCardProps['machine']) =>
  accountSettings.settings.defaults[machineKeyOf(machine)]

const remove = async () => {
  const { machine } = card
  const { dir } = card.profile
  // Only a default the user chose comes back with Undo, and only while no other one was chosen
  // since; a default that was just the fallback stays a fallback.
  const wasChosenDefault = chosenDefaultOn(machine) === dir
  accountSettings.setOffered(machine, dir, false)
  toast(t('settings.accounts.removed', { account: accountLabelOf(card.profile) }), {
    action: {
      label: t('settings.accounts.undo'),
      onClick: () =>
        wasChosenDefault && !chosenDefaultOn(machine)
          ? accountSettings.setDefault(machine, dir)
          : accountSettings.setOffered(machine, dir, true)
    }
  })
  // The card and its trigger are gone, so focus goes to the machine heading instead of <body>.
  await nextTick()
  requestAnimationFrame(() => document.getElementById(accountsHeadingIdOf(machine))?.focus())
}
</script>

<template>
  <DropdownMenu :modal="false">
    <DropdownMenuTrigger as-child>
      <NchIconButton
        :label="t('settings.accounts.menu', { account: accountLabelOf(card.profile) })"
        size="icon-sm"
        :class="triggerClass"
      >
        <Ellipsis class="size-4" aria-hidden="true" />
      </NchIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-auto min-w-52">
      <DropdownMenuItem
        :disabled="card.isDefault"
        @select="accountSettings.setDefault(card.machine, card.profile.dir)"
      >
        <Star aria-hidden="true" />
        {{ t('settings.accounts.make_default') }}
      </DropdownMenuItem>
      <DropdownMenuItem @select="emit('login')">
        <LogIn aria-hidden="true" />
        {{ t('settings.accounts.login_terminal') }}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel class="text-meta text-muted-foreground">
        {{ t('settings.accounts.color') }}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup v-model="tone">
        <DropdownMenuRadioItem v-for="value in accountToneList" :key="value" :value>
          <span
            class="size-2.5 rounded-full"
            :class="ACCOUNT_TONE_CLASS[value]"
            aria-hidden="true"
          />
          {{ t(`settings.accounts.tones.${value}`) }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="remove">
        <UserMinus aria-hidden="true" />
        {{ t('settings.accounts.remove') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
