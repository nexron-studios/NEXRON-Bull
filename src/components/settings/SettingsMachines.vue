<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import type { Machine } from '@/api/services/agentd.service'
import { machineService } from '@/api/services/machine.service'
import SettingsAddAccountDialog from '@/components/settings/SettingsAddAccountDialog.vue'
import SettingsMachineAddCard from '@/components/settings/SettingsMachineAddCard.vue'
import SettingsMachineCard from '@/components/settings/SettingsMachineCard.vue'
import SettingsMachineDialog from '@/components/settings/SettingsMachineDialog.vue'
import SettingsMachineRemoveDialog from '@/components/settings/SettingsMachineRemoveDialog.vue'
import SettingsSectionHeader from '@/components/settings/SettingsSectionHeader.vue'
import { MACHINES_KEY, useMachineEntries } from '@/composables/useAgentdCatalog'
import { useAgentdVersions } from '@/composables/useAgentdVersions'
import { useSettingsAccounts } from '@/composables/useSettingsAccounts'
import { handleError } from '@/lib/error'
import { useChatStore } from '@/stores/chat'
import type { MachineEntry } from '@/types/machine.type'

// This PC and every machine in Bull's list, side by side as peers once there is room for two, and
// the place of the next one beside them, which opens the assistant.
const { isPhone = false } = defineProps<{ isPhone?: boolean }>()

const isAssistantOpen = ref(false)
const assistantEntry = ref<MachineEntry | null>(null)
const removing = ref<string | null>(null)
const accountMachine = ref<Machine>(null)
const isAddAccountOpen = ref(false)

const { t } = useI18n()
const queryClient = useQueryClient()
const { groups, refetch } = useSettingsAccounts()
const { versionOf, refetch: refetchVersions } = useAgentdVersions()
const { data: entries } = useMachineEntries()
const { tabs } = storeToRefs(useChatStore())

const isRemoveOpen = computed({
  get: () => removing.value !== null,
  set: (isOpen) => {
    if (!isOpen) removing.value = null
  }
})

const remove = useMutation({
  mutationFn: machineService.remove,
  onSuccess: async () => {
    removing.value = null
    await queryClient.invalidateQueries({ queryKey: MACHINES_KEY })
  },
  onError: handleError
})

// Two columns: after an even number of machines the add card starts a row of its own.
const isAddCardAlone = computed(() => groups.value.length % 2 === 0)

const openChatsOn = (machine: Machine) => tabs.value.filter((tab) => tab.machine === machine).length
const entryOf = (machine: Machine) =>
  machine === null ? null : (entries.value?.find((entry) => entry.name === machine) ?? null)
// A host that comes back is asked for its accounts and its version again, not only one of them.
const retry = () => void Promise.all([refetch(), refetchVersions()])

const openAssistant = (entry: MachineEntry | null) => {
  assistantEntry.value = entry
  isAssistantOpen.value = true
}

const addAccountOn = (machine: string) => {
  accountMachine.value = machine
  isAddAccountOpen.value = true
}
</script>

<template>
  <SettingsSectionHeader
    :title="t('settings.sections.machines')"
    :description="t('settings.machines.description')"
    :is-phone
  />
  <ul class="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
    <li
      v-for="(group, index) in groups"
      :key="group.machine ?? ''"
      class="motion-stagger flex flex-col"
      :style="{ '--stagger-index': index }"
    >
      <SettingsMachineCard
        :group
        :version="versionOf(group.machine)"
        :open-chats="openChatsOn(group.machine)"
        :entry="entryOf(group.machine)"
        class="flex-1"
        @retry="retry"
        @check="openAssistant(entryOf(group.machine))"
        @remove="removing = group.machine"
      />
    </li>
    <li
      class="motion-stagger flex flex-col"
      :class="isAddCardAlone && '@3xl:col-span-2'"
      :style="{ '--stagger-index': groups.length }"
    >
      <SettingsMachineAddCard
        :is-alone="isAddCardAlone"
        class="flex-1"
        @connect="openAssistant(null)"
      />
    </li>
  </ul>
  <SettingsMachineDialog
    v-model:open="isAssistantOpen"
    :initial="assistantEntry"
    @add-account="addAccountOn"
  />
  <SettingsMachineRemoveDialog
    v-model:open="isRemoveOpen"
    :machine="removing ?? ''"
    :open-chats="openChatsOn(removing)"
    :is-working="remove.isPending.value"
    @confirm="removing && remove.mutate(removing)"
  />
  <SettingsAddAccountDialog
    v-model:open="isAddAccountOpen"
    :groups
    :preferred-machine="accountMachine"
  />
</template>
