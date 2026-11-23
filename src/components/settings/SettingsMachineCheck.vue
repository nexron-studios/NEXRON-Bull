<script setup lang="ts">
import { computed } from 'vue'
import {
  CircleCheck,
  Download,
  KeyRound,
  LoaderCircle,
  Pencil,
  RefreshCw,
  ShieldAlert,
  ShieldQuestion,
  Unplug,
  type LucideIcon
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import SettingsMachineKeyHelp from '@/components/settings/SettingsMachineKeyHelp.vue'
import { Button } from '@/components/ui/button'
import { useTerminalRequestStore } from '@/stores/terminalRequests'
import type { MachineEntry, MachineProbe, ProbeReason } from '@/types/machine.type'
import { forgetHostKeyCommandOf, probeActionOf } from '@/utils/machineAssistant'

// The check of one machine: while ssh runs, then what it found in plain words and the one step
// that moves on (install, fix the key, try again). The raw message waits under "details".
const {
  entry,
  probe,
  isAfterInstall = false
} = defineProps<{
  entry: MachineEntry
  probe: MachineProbe | null
  /** The check right after an install: the previous agentd waits beside the new one */
  isAfterInstall?: boolean
}>()

const emit = defineEmits<{ retry: []; back: []; install: []; use: [] }>()

const REASON_ICON: Record<ProbeReason, LucideIcon> = {
  ok: CircleCheck,
  offline: Unplug,
  auth_failed: KeyRound,
  host_key_changed: ShieldAlert,
  host_key_unknown: ShieldQuestion,
  no_agentd: Download,
  agentd_blocked: ShieldAlert,
  unsupported_system: Unplug
}

const { t } = useI18n()
const terminals = useTerminalRequestStore()

const action = computed(() => (probe ? probeActionOf(probe.reason) : null))
const params = computed(() => ({ machine: entry.name, version: probe?.version ?? '' }))
const oldAgentdFile = computed(() => (probe?.os === 'windows' ? 'agentd.old.exe' : 'agentd.old'))

const forgetKey = () =>
  terminals.request({
    machine: null,
    cwd: '',
    draft: forgetHostKeyCommandOf(entry, probe?.known_host ?? null)
  })
</script>

<template>
  <div v-if="!probe" class="flex items-center gap-3 py-2" role="status">
    <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
      <LoaderCircle
        class="size-5 text-muted-foreground motion-safe:animate-spin"
        aria-hidden="true"
      />
    </span>
    <div class="flex min-w-0 flex-col gap-0.5">
      <p class="font-semibold">
        {{ t('settings.machines.assistant.checking', { machine: entry.name }) }}
      </p>
      <p class="text-small text-muted-foreground">
        {{ t('settings.machines.assistant.checking_hint') }}
      </p>
    </div>
  </div>

  <div v-else class="motion-fade-in flex flex-col gap-4">
    <div
      class="flex items-start gap-3"
      :class="probe.reason !== 'ok' && 'motion-shake'"
      role="status"
    >
      <span
        class="grid size-10 shrink-0 place-items-center rounded-lg"
        :class="probe.reason === 'ok' ? 'bg-good/12 text-good' : 'bg-warning/12 text-warning'"
      >
        <component :is="REASON_ICON[probe.reason]" class="size-5" aria-hidden="true" />
      </span>
      <div class="flex min-w-0 flex-col gap-0.5">
        <p class="font-semibold break-words">
          {{ t(`settings.machines.reasons.${probe.reason}.title`, params) }}
        </p>
        <p class="text-small text-muted-foreground">
          {{ t(`settings.machines.reasons.${probe.reason}.hint`, params) }}
        </p>
      </div>
    </div>

    <SettingsMachineKeyHelp v-if="action === 'fix_key'" :entry />
    <p
      v-if="isAfterInstall && probe.reason === 'agentd_blocked'"
      class="text-meta text-muted-foreground"
    >
      {{ t('settings.machines.assistant.old_kept', { file: oldAgentdFile }) }}
    </p>
    <p v-if="action === 'forget_key'" class="text-meta text-muted-foreground">
      {{ t('settings.machines.assistant.forget_key_hint') }}
    </p>

    <details v-if="probe.detail" class="group text-meta text-muted-foreground">
      <summary
        class="cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {{ t('settings.machines.assistant.details', { machine: entry.name }) }}
      </summary>
      <pre class="mt-1.5 rounded-lg bg-muted p-2 font-mono break-all whitespace-pre-wrap">{{
        probe.detail
      }}</pre>
    </details>

    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
      <Button variant="ghost" @click="emit('back')">
        <Pencil class="size-4" aria-hidden="true" />{{ t('settings.machines.assistant.back') }}
      </Button>
      <Button v-if="action === 'add'" variant="outline" @click="emit('install')">
        <Download class="size-4" aria-hidden="true" />{{
          t('settings.machines.assistant.reinstall')
        }}
      </Button>
      <Button v-if="action === 'forget_key'" variant="outline" @click="forgetKey">
        <KeyRound class="size-4" aria-hidden="true" />{{
          t('settings.machines.assistant.forget_key')
        }}
      </Button>
      <Button v-if="action === 'add'" class="motion-press" @click="emit('use')">
        <CircleCheck class="size-4" aria-hidden="true" />{{ t('settings.machines.assistant.use') }}
      </Button>
      <Button v-else-if="action === 'install'" class="motion-press" @click="emit('install')">
        <Download class="size-4" aria-hidden="true" />{{
          probe.reason === 'agentd_blocked'
            ? t('settings.machines.assistant.reinstall')
            : t('settings.machines.assistant.install')
        }}
      </Button>
      <Button v-else-if="action !== 'none'" class="motion-press" @click="emit('retry')">
        <RefreshCw class="size-4" aria-hidden="true" />{{ t('settings.machines.assistant.retry') }}
      </Button>
    </div>
  </div>
</template>
