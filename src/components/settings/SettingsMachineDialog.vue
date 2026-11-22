<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CircleCheck, UserPlus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import SettingsMachineCheck from '@/components/settings/SettingsMachineCheck.vue'
import SettingsMachineForm from '@/components/settings/SettingsMachineForm.vue'
import SettingsMachineInstall from '@/components/settings/SettingsMachineInstall.vue'
import { Button } from '@/components/ui/button'
import { useMachineEntries } from '@/composables/useAgentdCatalog'
import { useMachineAssistant, type AssistantOpening } from '@/composables/useMachineAssistant'
import { useMachineNames } from '@/composables/useMachineNames'

// "Connect another machine" (decision of 22.11.2026): which machine, the check with its cause in
// plain words, agentd copied over with its steps, then on to an account there. A card that asks
// to check its machine opens it at the check.
const { opening } = defineProps<{ opening: AssistantOpening }>()

const emit = defineEmits<{ addAccount: [machine: string] }>()

// The steps differ in height by up to 320 px (form 470 px, check 150 px). Centred, the dialog moved
// its title by half of that on every step. Anchored at its top, only the bottom edge moves. 15rem
// is half the form step with suggestions (about 30rem), so the first step still opens centred; a
// step taller than the window scrolls inside the dialog.
const DIALOG_CLASS =
  'sm:max-w-xl [--dialog-top:max(1rem,calc(50dvh-15rem))] top-[var(--dialog-top)] translate-y-0 max-h-[calc(100dvh-var(--dialog-top)-1rem)] overflow-y-auto'

const open = defineModel<boolean>('open', { required: true })

// Handing over to the account dialog: focus going back to the card's button would count as a
// click outside that dialog and close it again at once.
const isHandingOver = ref(false)

const { t } = useI18n()
const { data: entries } = useMachineEntries()
const { state, start, check, install, finish, back } = useMachineAssistant()
const { nameOf } = useMachineNames()

// Changing a listed machine: it is named on the card, here only how ssh reaches it.
const title = computed(() =>
  opening.purpose === 'edit'
    ? t('settings.machines.assistant.edit_title', { machine: nameOf(opening.entry.name) })
    : t('settings.machines.assistant.title')
)
const description = computed(() =>
  opening.purpose === 'edit'
    ? t('settings.machines.assistant.edit_description')
    : t('settings.machines.assistant.description')
)
// A listed machine keeps its own name, whatever it is checked or changed to.
const keptName = computed(() => (opening.purpose === 'connect' ? null : opening.entry.name))

// A new machine may not take a name another one has or shows; the one of this run may keep its own.
const takenNames = computed(() => [
  nameOf(null),
  ...(entries.value ?? [])
    .filter((entry) => entry.name !== state.value.entry?.name)
    .flatMap((entry) => [entry.name, nameOf(entry.name)])
])

const addAccount = (machine: string) => {
  isHandingOver.value = true
  open.value = false
  emit('addAccount', machine)
}

watch(open, (isOpen) => {
  if (!isOpen) return
  isHandingOver.value = false
  start(opening)
})
</script>

<template>
  <NchResponsiveDialog
    v-model:open="open"
    :title
    :description
    :content-class="DIALOG_CLASS"
    :restores-focus="!isHandingOver"
  >
    <SettingsMachineForm
      v-if="state.step === 'pick'"
      class="motion-fade-in"
      :initial="state.entry"
      :taken-names
      :kept-name
      @check="check"
      @cancel="open = false"
    />
    <SettingsMachineCheck
      v-else-if="state.step === 'checking' || state.step === 'checked'"
      class="motion-fade-in"
      :entry="state.entry"
      :probe="state.step === 'checked' ? state.probe : null"
      :is-after-install="state.step === 'checked' && !!state.isAfterInstall"
      @retry="check(state.entry)"
      @back="back"
      @install="install(state.entry)"
      @use="state.step === 'checked' && finish(state.entry, state.probe)"
    />
    <SettingsMachineInstall
      v-else-if="state.step === 'installing' || state.step === 'install_failed'"
      :entry="state.entry"
      :current="state.step === 'installing' ? state.current : null"
      :failure="state.step === 'install_failed' ? state.failure : null"
      @retry="install(state.entry)"
      @back="back"
    />
    <div v-else class="motion-fade-in flex flex-col gap-4">
      <div class="flex items-start gap-3" role="status">
        <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-good/12 text-good">
          <CircleCheck class="motion-pop size-5" aria-hidden="true" />
        </span>
        <div class="flex min-w-0 flex-col gap-0.5">
          <p class="font-semibold break-words">
            {{ t('settings.machines.assistant.done_title', { machine: nameOf(state.entry.name) }) }}
          </p>
          <p class="text-small text-muted-foreground">
            {{ t('settings.machines.assistant.done_hint', { version: state.probe.version ?? '' }) }}
          </p>
        </div>
      </div>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="outline" @click="open = false">
          {{ t('settings.machines.assistant.close') }}
        </Button>
        <Button class="motion-press" @click="addAccount(state.entry.name)">
          <UserPlus class="size-4" aria-hidden="true" />
          {{ t('settings.machines.assistant.add_account') }}
        </Button>
      </div>
    </div>
  </NchResponsiveDialog>
</template>
