<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, KeyRound, SquareTerminal } from '@lucide/vue'
import { useQuery } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import { machineService } from '@/api/services/machine.service'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchSectionEmpty from '@/components/common/NchSectionEmpty.vue'
import SettingsSwitchRow from '@/components/settings/SettingsSwitchRow.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMachineEntries } from '@/composables/useAgentdCatalog'
import { copyText } from '@/lib/clipboard'
import { useTerminalRequestStore } from '@/stores/terminalRequests'
import type { MachineEntry } from '@/types/machine.type'
import {
  authorizedKeysCommandOf,
  KEYGEN_COMMAND,
  unixAuthorizedKeysCommandOf
} from '@/utils/machineAssistant'

// A machine that refuses this PC's key: log in there once with the password in Bull's terminal and
// paste one line that adds the key. Without a key, the first step makes one.
const { entry } = defineProps<{ entry: MachineEntry }>()

const isAdmin = ref(false)
// A refused login tells nothing about the system there; an earlier check may have.
const isUnix = ref(false)

const { t } = useI18n()
const machines = useMachineEntries()
const knownOs = computed(
  () => machines.data.value?.find((listed) => listed.name === entry.name)?.os ?? null
)
watch(
  knownOs,
  (os) => {
    if (os) isUnix.value = os !== 'windows'
  },
  { immediate: true }
)
const terminals = useTerminalRequestStore()
const publicKey = useQuery({
  queryKey: ['machines', 'public-key'],
  queryFn: machineService.publicKey,
  staleTime: 0
})

const commandLine = computed(() => {
  const key = publicKey.data.value
  if (!key) return ''
  return isUnix.value
    ? unixAuthorizedKeysCommandOf(key)
    : authorizedKeysCommandOf(key, isAdmin.value)
})

const openRemoteTerminal = () =>
  terminals.request({ machine: entry.name, cwd: '', title: entry.name })
const makeKey = () =>
  terminals.request({ machine: null, cwd: '', draft: KEYGEN_COMMAND, title: KEYGEN_COMMAND })
</script>

<template>
  <div class="flex flex-col gap-3">
    <Skeleton v-if="publicKey.isPending.value" class="h-24 w-full rounded-lg" />
    <NchSectionEmpty
      v-else-if="!publicKey.data.value"
      :icon="KeyRound"
      :title="t('settings.machines.assistant.key.none_title')"
      :hint="t('settings.machines.assistant.key.none_hint')"
      class="motion-fade-in"
    >
      <Button variant="outline" size="sm" class="motion-press mt-1.5 self-start" @click="makeKey">
        <SquareTerminal class="size-4" aria-hidden="true" />
        {{ t('settings.machines.assistant.key.make') }}
      </Button>
    </NchSectionEmpty>
    <ol v-else class="motion-fade-in flex list-decimal flex-col gap-3 pl-5 text-small">
      <!-- A flex item loses its number, so each step lays out inside its item. -->
      <li>
        <div class="flex flex-col items-start gap-1.5">
          <span>{{ t('settings.machines.assistant.key.login', { machine: entry.name }) }}</span>
          <Button variant="outline" size="sm" class="motion-press" @click="openRemoteTerminal">
            <SquareTerminal class="size-4" aria-hidden="true" />
            {{ t('settings.machines.assistant.key.open_terminal') }}
          </Button>
        </div>
      </li>
      <li>
        <div class="flex flex-col gap-1.5">
          <span>{{ t('settings.machines.assistant.key.paste') }}</span>
          <div
            class="flex items-start gap-2 rounded-lg border border-border bg-background p-2 pl-3"
          >
            <code class="min-w-0 flex-1 py-1 font-mono text-meta break-all">{{ commandLine }}</code>
            <NchIconButton
              :label="t('settings.machines.assistant.copy')"
              size="icon-sm"
              @click="copyText(commandLine)"
            >
              <Copy class="size-4" aria-hidden="true" />
            </NchIconButton>
          </div>
          <SettingsSwitchRow
            v-model="isUnix"
            :title="t('settings.machines.assistant.key.unix')"
            :hint="t('settings.machines.assistant.key.unix_hint')"
          />
          <SettingsSwitchRow
            v-if="!isUnix"
            v-model="isAdmin"
            :title="t('settings.machines.assistant.key.admin')"
            :hint="t('settings.machines.assistant.key.admin_hint')"
          />
        </div>
      </li>
      <li>{{ t('settings.machines.assistant.key.again') }}</li>
    </ol>
  </div>
</template>
