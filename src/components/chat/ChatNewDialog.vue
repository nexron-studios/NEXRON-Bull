<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FolderOpen, History, Monitor, Play, Plus, Sparkles, UserRound, Zap } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BrandClawdMark from '@/components/brand/BrandClawdMark.vue'
import ChatTitleText from '@/components/chat/ChatTitleText.vue'
import NchEmpty from '@/components/common/NchEmpty.vue'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import SettingsSwitchRow from '@/components/settings/SettingsSwitchRow.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useHasOtherMachines,
  useMachines,
  useProfiles,
  useRecentSessions
} from '@/composables/useAgentdCatalog'
import { useMachineNames } from '@/composables/useMachineNames'
import { useAccountDefaultLabels } from '@/composables/useAccountDefaultLabels'
import { useWorktreeOffer } from '@/composables/useWorktreeOffer'
import { useAccountSettingsStore } from '@/stores/accountSettings'
import { useChatStore } from '@/stores/chat'
import type { SessionSummaryProps } from '@/types/agentd.type'
import { modelList, permissionModeList, type PermissionMode } from '@/utils/chatTab'
import { NEW_CHAT_DEFAULTS, newChatSettingsOf } from '@/utils/newChat'
import { modeLookOf } from '@/utils/sessionSettingIcons'

const RESUME_SKELETON_ROWS = 5
/** Select value for "use what the account is set to"; Reka selects cannot hold null. */
const ACCOUNT_DEFAULT = 'account'
/** Select value for this computer, for the same reason. */
const THIS_MACHINE = 'this'

const open = defineModel<boolean>('open', { required: true })

const machineChoice = ref<string>(THIS_MACHINE)
const profileDir = ref<string>('')
const cwd = ref('')
const model = ref<string>(NEW_CHAT_DEFAULTS.model)
const mode = ref<PermissionMode | typeof ACCOUNT_DEFAULT>(NEW_CHAT_DEFAULTS.permissionMode)

const { t } = useI18n()
const { nameOf } = useMachineNames()
const chat = useChatStore()
const accountSettings = useAccountSettingsStore()
const machines = useMachines()
// With this computer alone there is nothing to pick, so the row goes away.
const hasOtherMachines = useHasOtherMachines()
const machine = computed(() => (machineChoice.value === THIS_MACHINE ? null : machineChoice.value))
const profiles = useProfiles(machine)
const recent = useRecentSessions(machine)
const { canHaveWorktree, isWorktreeWanted, isWorktreePlanned, isSettled } = useWorktreeOffer(
  cwd,
  machine
)

// Only the accounts switched on in the settings, in agentd's order; `fillDefaults` picks the default.
const offeredProfiles = computed(() =>
  accountSettings.offeredOf(machine.value, profiles.data.value ?? [])
)
const folders = computed(() => [
  ...new Set((recent.data.value ?? []).map((session) => session.cwd))
])
const canStart = computed(() => !!profileDir.value && !!cwd.value.trim() && isSettled.value)
// "Wie im Profil" said nothing to the user: the default option names what will actually run.
// Only once an account is picked: `null` would ask for the default profile instead.
const defaults = useAccountDefaultLabels(
  machine,
  () => profileDir.value || null,
  () => !!profileDir.value
)
// Spelled out here: the select would keep the text an option had when it was picked, and the
// account's default only gets its name once the account's settings arrive.
// The default model names the effort it starts with, which the dialog has no select for.
const modelOptionLabel = (name: string) =>
  name === NEW_CHAT_DEFAULTS.model
    ? t('composer.model_effort', {
        model: t(`chat.models.${name}`),
        effort: t(`composer.efforts.${NEW_CHAT_DEFAULTS.effort}`)
      })
    : t(`chat.models.${name}`)
const modelChoiceLabel = computed(() =>
  model.value === ACCOUNT_DEFAULT ? defaults.modelLabel.value : modelOptionLabel(model.value)
)
const modeChoiceLabel = computed(() =>
  mode.value === ACCOUNT_DEFAULT ? defaults.modeLabel.value : t(`chat.modes.${mode.value}`)
)
// No icon until the account answers: the hand would promise "asks first" for an account that
// may well let everything run.
const accountDefaultLook = computed(() =>
  defaults.mode.value ? modeLookOf(defaults.mode.value) : null
)
const modeChoiceLook = computed(() =>
  mode.value === ACCOUNT_DEFAULT ? accountDefaultLook.value : modeLookOf(mode.value)
)
const modelHint = computed(() =>
  model.value === ACCOUNT_DEFAULT ? defaults.modelHint.value : null
)
const modeHint = computed(() => (mode.value === ACCOUNT_DEFAULT ? defaults.modeHint.value : null))

const startNew = () => {
  const profile = offeredProfiles.value.find((p) => p.dir === profileDir.value)
  if (!profile || !canStart.value) return
  chat.openNew({
    profile: profile.dir,
    account: profile.label,
    cwd: cwd.value.trim(),
    machine: machine.value,
    isWorktreePlanned: isWorktreePlanned.value,
    ...newChatSettingsOf(
      model.value === ACCOUNT_DEFAULT ? null : model.value,
      mode.value === ACCOUNT_DEFAULT ? null : mode.value
    )
  })
  open.value = false
}

const resume = (session: SessionSummaryProps) => {
  chat.resume(session, machine.value)
  open.value = false
}

// Accounts and folders belong to the chosen machine; fill the blanks once its lists arrive.
const fillDefaults = () => {
  // The dialog stays mounted: an account switched off in the settings meanwhile is no choice.
  const isStillOffered = offeredProfiles.value.some((p) => p.dir === profileDir.value)
  if (!isStillOffered)
    profileDir.value =
      accountSettings.defaultOf(machine.value, profiles.data.value ?? [])?.dir ?? ''
  cwd.value ||= folders.value[0] ?? ''
}

watch(open, (isOpen) => {
  if (!isOpen) return
  void recent.refetch()
  // Every new chat starts on the machine's default account (settings › Konten) and the defaults.
  profileDir.value = ''
  model.value = NEW_CHAT_DEFAULTS.model
  mode.value = NEW_CHAT_DEFAULTS.permissionMode
  fillDefaults()
})
watch(machine, () => {
  profileDir.value = ''
  cwd.value = ''
})
watch([offeredProfiles, folders], fillDefaults)
</script>

<template>
  <NchResponsiveDialog
    v-model:open="open"
    :title="t('chat.new_title')"
    :description="t('chat.new_hint')"
    content-class="sm:max-w-xl"
  >
    <div v-if="hasOtherMachines" class="flex items-center gap-3">
      <Label for="machine" class="shrink-0"
        ><Monitor class="size-4" aria-hidden="true" />{{ t('chat.machine') }}</Label
      >
      <Select v-model="machineChoice">
        <SelectTrigger id="machine" class="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem :value="THIS_MACHINE">{{ nameOf(null) }}</SelectItem>
          <SelectItem v-for="name in machines.data.value" :key="name" :value="name">
            {{ nameOf(name) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <Tabs default-value="new" class="min-w-0">
      <TabsList>
        <TabsTrigger value="new"
          ><Plus class="size-4" aria-hidden="true" />{{ t('chat.tab_new') }}</TabsTrigger
        >
        <TabsTrigger value="resume"
          ><History class="size-4" aria-hidden="true" />{{ t('chat.tab_resume') }}</TabsTrigger
        >
      </TabsList>

      <TabsContent value="new">
        <form class="mt-3 flex flex-col gap-4" @submit.prevent="startNew">
          <div class="flex flex-col gap-1.5">
            <Label for="account"
              ><UserRound class="size-4" aria-hidden="true" />{{ t('chat.account') }}</Label
            >
            <Skeleton v-if="profiles.isPending.value" class="h-8 w-full" />
            <p
              v-else-if="!offeredProfiles.length"
              class="rounded-md border border-dashed border-border px-3 py-2 text-meta text-muted-foreground"
            >
              {{ t('chat.no_offered_accounts') }}
            </p>
            <Select v-else v-model="profileDir">
              <SelectTrigger id="account" class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="profile in offeredProfiles"
                  :key="profile.dir"
                  :value="profile.dir"
                >
                  {{ profile.label
                  }}<span v-if="profile.email" class="text-muted-foreground">
                    · {{ profile.email }}</span
                  >
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="folder"
              ><FolderOpen class="size-4" aria-hidden="true" />{{ t('chat.folder') }}</Label
            >
            <Input
              id="folder"
              v-model="cwd"
              list="recent-folders"
              name="folder"
              autocomplete="off"
              class="font-mono"
            />
            <datalist id="recent-folders">
              <option v-for="folder in folders" :key="folder" :value="folder" />
            </datalist>
            <p class="text-meta text-muted-foreground">{{ t('chat.folder_hint') }}</p>
          </div>
          <SettingsSwitchRow
            v-if="canHaveWorktree"
            v-model="isWorktreeWanted"
            :title="t('worktree.own')"
            :hint="t('worktree.own_hint')"
          />
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <Label for="model"
                ><Sparkles class="size-4" aria-hidden="true" />{{ t('chat.model') }}</Label
              >
              <Select v-model="model">
                <SelectTrigger id="model" class="w-full">
                  <SelectValue>
                    <BrandClawdMark :size="10" />
                    {{ modelChoiceLabel }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="ACCOUNT_DEFAULT">
                    <BrandClawdMark :size="10" class="text-brand!" />
                    {{ defaults.modelLabel.value }}
                  </SelectItem>
                  <SelectItem v-for="name in modelList" :key="name" :value="name">
                    <BrandClawdMark :size="10" class="text-brand!" />
                    {{ modelOptionLabel(name) }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p v-if="modelHint" class="text-meta text-muted-foreground">{{ modelHint }}</p>
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="mode"
                ><Zap class="size-4" aria-hidden="true" />{{ t('chat.mode') }}</Label
              >
              <Select v-model="mode">
                <SelectTrigger id="mode" class="w-full">
                  <SelectValue>
                    <component
                      :is="modeChoiceLook.icon"
                      v-if="modeChoiceLook"
                      :class="modeChoiceLook.tone"
                      aria-hidden="true"
                    />
                    {{ modeChoiceLabel }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="ACCOUNT_DEFAULT">
                    <component
                      :is="accountDefaultLook.icon"
                      v-if="accountDefaultLook"
                      :class="accountDefaultLook.tone"
                      aria-hidden="true"
                    />
                    {{ defaults.modeLabel.value }}
                  </SelectItem>
                  <SelectItem v-for="name in permissionModeList" :key="name" :value="name">
                    <component
                      :is="modeLookOf(name).icon"
                      :class="modeLookOf(name).tone"
                      aria-hidden="true"
                    />
                    {{ t(`chat.modes.${name}`) }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p v-if="modeHint" class="text-meta text-muted-foreground">{{ modeHint }}</p>
            </div>
          </div>
          <Button type="submit" class="self-end" :disabled="!canStart">
            <Play class="size-4" aria-hidden="true" />
            {{ t('chat.start') }}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="resume" class="min-w-0">
        <div class="mt-3 flex max-h-96 min-h-48 min-w-0 flex-col overflow-x-hidden overflow-y-auto">
          <template v-if="recent.isPending.value">
            <Skeleton v-for="row in RESUME_SKELETON_ROWS" :key="row" class="mb-2 h-12 w-full" />
          </template>
          <NchEmpty
            v-else-if="!recent.data.value?.length"
            :icon="History"
            :title="t('chat.tab_resume')"
            :hint="t('chat.resume_empty')"
            size="sm"
          />
          <button
            v-for="session in recent.data.value"
            v-else
            :key="session.session_id"
            type="button"
            class="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-muted"
            @click="resume(session)"
          >
            <span class="w-full truncate text-small font-medium"
              ><ChatTitleText :title="session.title || session.session_id"
            /></span>
            <span class="flex w-full items-center gap-1.5 truncate text-meta text-muted-foreground">
              <FolderOpen class="size-3.5 shrink-0" aria-hidden="true" />
              {{ t('chat.resume_meta', { account: session.account, folder: session.cwd }) }}
            </span>
          </button>
        </div>
      </TabsContent>
    </Tabs>
  </NchResponsiveDialog>
</template>
