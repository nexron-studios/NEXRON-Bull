<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, LoaderCircle, LogIn, Plus } from '@lucide/vue'
import { useMutation } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import { useMachineNames } from '@/composables/useMachineNames'
import { toast } from '@/lib/toast'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import NchRangeSwitch from '@/components/common/NchRangeSwitch.vue'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import SettingsAddExistingAccount from '@/components/settings/SettingsAddExistingAccount.vue'
import SettingsLoginPanel from '@/components/settings/SettingsLoginPanel.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAccountLogin } from '@/composables/useAccountLogin'
import type { MachineAccounts } from '@/composables/useSettingsAccounts'
import { handleError } from '@/lib/error'
import { useAccountSettingsStore } from '@/stores/accountSettings'
import type { ProfileProps } from '@/types/agentd.type'
import { isLoggedOut } from '@/utils/accountCards'
import { accountNameProblemOf, newProfileDirOf, machineKeyOf } from '@/utils/accountSettings'
import { ACCOUNT_TONE_CLASS, accountKeyOf, accountToneList, type AccountTone } from '@/utils/quota'

// Adding an account (Figma "22b", "22b2"): either a new one (name, machine, colour; agentd creates
// `~/.claude-<name>`, then the login follows in the dialog) or a profile already on the machine.
const { groups, preferredMachine = null } = defineProps<{
  groups: MachineAccounts[]
  /** The machine to start on, e.g. the one the machine assistant just connected */
  preferredMachine?: Machine
}>()

const addModeList = ['new', 'existing'] as const
type AddMode = (typeof addModeList)[number]

const open = defineModel<boolean>('open', { required: true })

const mode = ref<AddMode>('new')
const name = ref('')
const machineChoice = ref('')
/** `null` keeps the colour Bull gives every account by itself. */
const tone = ref<AccountTone | null>(null)
const isNameTouched = ref(false)
const created = ref<{ machine: Machine; profile: ProfileProps } | null>(null)

const { t } = useI18n()
const { nameOf } = useMachineNames()
const accountSettings = useAccountSettingsStore()
const { refreshMachine } = useAccountLogin()

const modeOptions = computed(() =>
  addModeList.map((value) => ({ value, label: t(`settings.add.modes.${value}`) }))
)
// Only machines that answered: a new folder needs an agentd to create it, and the list of
// existing profiles comes from it.
const reachable = computed(() => groups.filter((group) => group.state === 'ready'))
const machineOptions = computed(() =>
  reachable.value.map((group) => ({
    value: machineKeyOf(group.machine),
    label: nameOf(group.machine)
  }))
)
const target = computed(
  () => reachable.value.find((group) => machineKeyOf(group.machine) === machineChoice.value) ?? null
)
const trimmed = computed(() => name.value.trim())
// A folder of that name left behind by an aborted login is logged in again instead of blocking
// the name; Windows folder names ignore case. Only for a name a new folder could have, so
// `default` (`~/.claude`) never qualifies.
const leftover = computed(() => {
  if (accountNameProblemOf(trimmed.value, [])) return null
  const card = target.value?.cards.find(
    (entry) => isLoggedOut(entry) && entry.profile.label.toLowerCase() === trimmed.value
  )
  return card?.profile ?? null
})
const nameProblem = computed(() =>
  accountNameProblemOf(
    trimmed.value,
    (target.value?.profiles ?? [])
      .filter((profile) => profile !== leftover.value)
      .map((profile) => profile.label)
  )
)
const folder = computed(
  () => leftover.value?.dir ?? newProfileDirOf(target.value?.profiles ?? [], trimmed.value || '…')
)
const machineName = computed(() => nameOf(target.value?.machine ?? null))

const create = useMutation({
  mutationFn: async ({ machine, accountName }: { machine: Machine; accountName: string }) =>
    (
      await agentdService.ask<'profile_created'>(
        { op: 'create_profile', name: accountName },
        machine
      )
    ).profile,
  onSuccess: (profile, { machine }) => {
    startLogin(machine, profile)
    toast.success(t('settings.add.created', { folder: profile.dir }))
    void refreshMachine(machine)
  },
  onError: handleError
})

/** The folder exists: Bull offers it (again, if it was removed) and the login follows. */
const startLogin = (machine: Machine, profile: ProfileProps) => {
  // No login yet, so a picked colour waits under the folder until the account has an email.
  if (tone.value)
    accountSettings.setTone(
      accountKeyOf({ email: null, machine, profile: profile.dir }),
      tone.value
    )
  accountSettings.setOffered(machine, profile.dir, true)
  created.value = { machine, profile }
}

const submit = () => {
  isNameTouched.value = true
  if (nameProblem.value || !target.value) return
  if (leftover.value) return startLogin(target.value.machine, leftover.value)
  create.mutate({ machine: target.value.machine, accountName: trimmed.value })
}

watch(open, (isOpen) => {
  if (!isOpen) return
  mode.value = 'new'
  name.value = ''
  tone.value = null
  isNameTouched.value = false
  created.value = null
  const preferred = machineKeyOf(preferredMachine)
  machineChoice.value = machineOptions.value.some((option) => option.value === preferred)
    ? preferred
    : (machineOptions.value[0]?.value ?? '')
})
// Machines answer one by one: a choice that is not (or no longer) reachable moves to one that is,
// and the preferred machine (just connected, its accounts still loading) takes over once it answers.
watch(machineOptions, (options, previous) => {
  const preferred = machineKeyOf(preferredMachine)
  const isPresent = (list: typeof options | undefined) =>
    !!list?.some((option) => option.value === preferred)
  if (preferredMachine !== null && isPresent(options) && !isPresent(previous)) {
    machineChoice.value = preferred
    return
  }
  if (options.some((option) => option.value === machineChoice.value)) return
  machineChoice.value = options[0]?.value ?? ''
})
</script>

<template>
  <NchResponsiveDialog
    v-model:open="open"
    :title="
      created
        ? t('settings.login.title', { account: created.profile.label })
        : t('settings.add.title')
    "
    :description="
      created
        ? t('settings.login.description')
        : mode === 'new'
          ? t('settings.add.description')
          : t('settings.add.existing_intro')
    "
    content-class="sm:max-w-lg"
  >
    <SettingsLoginPanel
      v-if="created"
      :machine="created.machine"
      :profile="created.profile"
      @done="open = false"
    />
    <NchRangeSwitch
      v-if="!created"
      v-model="mode"
      :options="modeOptions"
      :label="t('settings.add.title')"
      class="mb-4 flex w-full [&>button]:flex-1"
    />
    <div v-if="!created && mode === 'existing'" class="flex flex-col gap-4">
      <SettingsAddExistingAccount
        v-model:machine-choice="machineChoice"
        :machine-options
        :target
        :machine-name
      />
      <div class="flex justify-end">
        <Button type="button" variant="outline" @click="open = false">{{
          t('settings.add.done')
        }}</Button>
      </div>
    </div>
    <form v-else-if="!created" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <div class="flex flex-col gap-1.5">
        <Label for="account-name">{{ t('settings.add.name') }}</Label>
        <Input
          id="account-name"
          v-model="name"
          name="account-name"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          class="font-mono"
          :aria-invalid="isNameTouched && !!nameProblem"
          aria-describedby="account-name-hint"
          @blur="isNameTouched = !!name"
        />
        <p
          id="account-name-hint"
          class="text-meta"
          :class="isNameTouched && nameProblem ? 'text-critical' : 'text-muted-foreground'"
          :role="isNameTouched && nameProblem ? 'alert' : undefined"
        >
          {{
            isNameTouched && nameProblem
              ? t(`settings.add.name_problems.${nameProblem}`)
              : leftover
                ? t('settings.add.name_reuse')
                : t('settings.add.name_hint')
          }}
        </p>
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-4">
        <div v-if="machineOptions.length > 1" class="flex min-w-0 flex-col gap-1.5">
          <span class="text-small font-medium">{{ t('settings.add.machine') }}</span>
          <NchRangeSwitch
            v-model="machineChoice"
            :options="machineOptions"
            :label="t('settings.add.machine')"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span id="account-color" class="text-small font-medium">{{
            t('settings.add.color')
          }}</span>
          <div role="group" aria-labelledby="account-color" class="flex items-center gap-1">
            <button
              v-for="value in accountToneList"
              :key="value"
              type="button"
              :aria-pressed="tone === value"
              :aria-label="t(`settings.accounts.tones.${value}`)"
              class="grid size-8 touch-manipulation place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              @click="tone = value"
            >
              <span
                class="grid size-5 place-items-center rounded-full ring-offset-2 ring-offset-background"
                :class="[ACCOUNT_TONE_CLASS[value], { 'ring-2 ring-foreground': tone === value }]"
              >
                <Check
                  v-if="tone === value"
                  class="size-3 text-brand-foreground"
                  aria-hidden="true"
                />
              </span>
            </button>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-small font-medium">{{ t('settings.add.folder') }}</span>
        <span class="font-mono text-meta break-all text-muted-foreground">{{
          folder ?? t('settings.add.folder_unknown', { machine: machineName })
        }}</span>
      </div>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" @click="open = false">{{
          t('global.cancel')
        }}</Button>
        <Button type="submit" :disabled="create.isPending.value || !target">
          <LoaderCircle
            v-if="create.isPending.value"
            class="size-4 motion-safe:animate-spin"
            aria-hidden="true"
          />
          <LogIn v-else-if="leftover" class="size-4" aria-hidden="true" />
          <Plus v-else class="size-4" aria-hidden="true" />
          {{ leftover ? t('settings.accounts.relogin') : t('settings.add.create') }}
        </Button>
      </div>
    </form>
  </NchResponsiveDialog>
</template>
