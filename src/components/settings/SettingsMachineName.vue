<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { Check, Pencil, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { Machine } from '@/api/services/agentd.service'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Input } from '@/components/ui/input'
import { useMachineNames } from '@/composables/useMachineNames'
import { useSidebarMachine } from '@/composables/useSidebarMachine'
import { MAX_MACHINE_NAME_CHARS, isMachineNameTaken } from '@/utils/machineLabel'

// The name on a machine card, and renaming it in place. Only the shown name changes: tabs, Bull's
// list and ssh keep the machine's own name, so a running chat never notices.
const { machine, headingId } = defineProps<{ machine: Machine; headingId: string }>()

const isEditing = ref(false)
const draft = ref('')
const isSubmitted = ref(false)

const { t } = useI18n()
const { segments } = useSidebarMachine()
const { nameOf, defaultNameOf, rename } = useMachineNames()
const inputId = useId()
const hintId = useId()
const editButtonId = useId()

const name = computed(() => nameOf(machine))
const isRenamed = computed(() => name.value !== defaultNameOf(machine))
// The sidebar's machines: they stand in with the last known list while Bull's list loads.
const otherNames = computed(() =>
  segments.value.filter((segment) => segment.machine !== machine).map((segment) => segment.label)
)
// An empty field shows the default name, which another machine may carry by now.
const isTaken = computed(() =>
  isMachineNameTaken(draft.value.trim() || defaultNameOf(machine), otherNames.value)
)
const isProblemShown = computed(() => isSubmitted.value && isTaken.value)
const subtitle = computed(() => {
  if (machine === null) return t('settings.machines.local')
  return isRenamed.value
    ? t('settings.machines.remote_as', { host: machine })
    : t('settings.machines.remote')
})

const focusById = (id: string) => document.getElementById(id)?.focus()

const startEditing = async () => {
  draft.value = name.value
  isSubmitted.value = false
  isEditing.value = true
  await nextTick()
  const input = document.getElementById(inputId)
  if (input instanceof HTMLInputElement) input.select()
}

const stopEditing = async () => {
  isEditing.value = false
  await nextTick()
  focusById(editButtonId)
}

const save = () => {
  isSubmitted.value = true
  if (isTaken.value) {
    focusById(inputId)
    return
  }
  rename(machine, draft.value)
  void stopEditing()
}
</script>

<template>
  <form
    v-if="isEditing"
    class="flex min-w-48 flex-1 flex-col gap-1"
    novalidate
    @submit.prevent="save"
    @keydown.esc.stop.prevent="stopEditing"
  >
    <!-- The card stays named by this heading while its name is being edited. -->
    <h2 :id="headingId" class="sr-only">{{ name }}</h2>
    <div class="flex items-center gap-1">
      <Input
        :id="inputId"
        v-model="draft"
        name="machine-display-name"
        autocomplete="off"
        :maxlength="MAX_MACHINE_NAME_CHARS"
        :placeholder="defaultNameOf(machine)"
        :aria-label="t('settings.machines.rename_label', { machine: name })"
        :aria-invalid="isProblemShown"
        :aria-describedby="hintId"
        class="h-8 min-w-0 flex-1 font-semibold"
      />
      <NchIconButton
        type="submit"
        size="icon-sm"
        class="motion-press shrink-0"
        :label="t('global.save')"
      >
        <Check class="size-4" aria-hidden="true" />
      </NchIconButton>
      <NchIconButton
        size="icon-sm"
        class="motion-press shrink-0"
        :label="t('global.cancel')"
        @click="stopEditing"
      >
        <X class="size-4" aria-hidden="true" />
      </NchIconButton>
    </div>
    <p
      :id="hintId"
      class="truncate text-meta"
      :class="isProblemShown ? 'motion-shake text-critical' : 'text-muted-foreground'"
      :role="isProblemShown ? 'alert' : undefined"
    >
      {{
        isProblemShown
          ? t('settings.machines.rename_taken')
          : t('settings.machines.rename_hint', { name: defaultNameOf(machine) })
      }}
    </p>
  </form>
  <div v-else class="flex min-w-0 flex-1 flex-col">
    <div class="flex min-w-0 items-center gap-1">
      <h2 :id="headingId" class="truncate font-semibold">{{ name }}</h2>
      <NchIconButton
        :id="editButtonId"
        size="icon-sm"
        class="motion-press shrink-0 text-muted-foreground"
        :label="t('settings.machines.rename', { machine: name })"
        @click="startEditing"
      >
        <Pencil class="size-3.5" aria-hidden="true" />
      </NchIconButton>
    </div>
    <span class="truncate text-meta text-muted-foreground">{{ subtitle }}</span>
  </div>
</template>
