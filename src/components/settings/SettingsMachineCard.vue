<script setup lang="ts">
import { computed, useId } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import {
  Clock,
  CircleCheck,
  CircleX,
  Cpu,
  MessagesSquare,
  PlugZap,
  Monitor,
  Server,
  ServerOff,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Wrench
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { machineService } from '@/api/services/machine.service'
import AccountChip from '@/components/account/AccountChip.vue'
import NchSectionEmpty from '@/components/common/NchSectionEmpty.vue'
import SettingsMachineName from '@/components/settings/SettingsMachineName.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAgeFormat } from '@/composables/useAgeFormat'
import { useMinuteClock } from '@/composables/useClock'
import { useMachineNames } from '@/composables/useMachineNames'
import type { AgentdVersion } from '@/composables/useAgentdVersions'
import type { MachineAccounts } from '@/composables/useSettingsAccounts'
import type { MachineEntry } from '@/types/machine.type'
import { accountNameOf } from '@/utils/accountCards'

// One machine as a card (Figma 22c): whether its agentd answers, which version runs there, how
// many chats are open on it, when it last reported, and the accounts Bull offers there.
const {
  group,
  version,
  openChats,
  entry = null
} = defineProps<{
  group: MachineAccounts
  version: AgentdVersion
  openChats: number
  /** How ssh reaches it; `null` for this PC */
  entry?: MachineEntry | null
}>()

const emit = defineEmits<{ retry: []; check: []; edit: []; remove: [] }>()

const PROBE_STALE_TIME_MS = 60 * 1000

const { t } = useI18n()
const { nameOf } = useMachineNames()
// Only a machine that does not answer is asked why, once a minute at most.
const probe = useQuery({
  queryKey: computed(() => ['machines', 'probe', entry] as const),
  queryFn: () => (entry ? machineService.test(entry) : Promise.resolve(null)),
  enabled: computed(() => group.state === 'failed' && entry !== null),
  staleTime: PROBE_STALE_TIME_MS,
  retry: 0
})
const formatAge = useAgeFormat()
const now = useMinuteClock()

const SKELETON_CHIPS = 2

// A host alias can be any word, even "this"; a generated id never clashes with another card's.
const headingId = useId()

const name = computed(() => nameOf(group.machine))
// The local agentd comes with the app, a host's from the deploy script: each has its own fix.
const versionUnknownHint = computed(() =>
  group.machine === null
    ? t('settings.machines.version_unknown_local')
    : t('settings.machines.version_unknown')
)
// The cause once the check found one; until then the general note.
const failedTitle = computed(() =>
  probe.data.value
    ? t(`settings.machines.reasons.${probe.data.value.reason}.title`, { machine: name.value })
    : t('settings.machines.accounts_failed_title')
)
const failedHint = computed(() =>
  probe.data.value
    ? t(`settings.machines.reasons.${probe.data.value.reason}.hint`, {
        machine: name.value,
        version: probe.data.value.version ?? ''
      })
    : t('settings.accounts.machine_failed', { machine: name.value })
)
const answered = computed(() =>
  group.answeredAt === null
    ? t('settings.machines.never')
    : t('settings.machines.answered_ago', {
        age: formatAge.value(now.value.getTime() - group.answeredAt)
      })
)
</script>

<template>
  <article
    class="@container flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
    :aria-labelledby="headingId"
  >
    <header class="flex flex-wrap items-center gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
        <component
          :is="group.machine === null ? Monitor : Server"
          class="size-5 text-muted-foreground"
          aria-hidden="true"
        />
      </span>
      <SettingsMachineName :machine="group.machine" :heading-id />
      <template v-if="group.state === 'loading'">
        <Skeleton class="h-6 w-24 rounded-full" />
        <span class="sr-only" role="status">{{ t('settings.machines.checking') }}</span>
      </template>
      <span
        v-else
        class="motion-fade-in inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 text-meta whitespace-nowrap"
        :class="group.state === 'ready' ? 'text-good' : 'text-warning'"
      >
        <CircleCheck v-if="group.state === 'ready'" class="size-3.5" aria-hidden="true" />
        <CircleX v-else class="size-3.5" aria-hidden="true" />
        {{
          group.state === 'ready'
            ? t('settings.machines.reachable')
            : t('settings.machines.unreachable')
        }}
      </span>
    </header>

    <dl class="grid grid-cols-2 gap-x-4 gap-y-3 @sm:grid-cols-3">
      <div class="flex min-w-0 flex-col gap-0.5">
        <dt class="flex items-center gap-1.5 text-meta text-muted-foreground">
          <Cpu class="size-3.5 shrink-0" aria-hidden="true" />{{ t('settings.machines.agentd') }}
        </dt>
        <dd
          v-if="version.state === 'known'"
          class="motion-fade-in truncate font-mono text-small tabular-nums"
        >
          {{ version.version }}
        </dd>
        <dd v-else-if="version.state === 'asking'"><Skeleton class="mt-0.5 h-4 w-14" /></dd>
        <!-- No answer from a machine that is not reachable says nothing about its version. -->
        <dd v-else-if="group.state === 'failed'" class="text-small text-muted-foreground">–</dd>
        <dd v-else class="truncate text-small text-muted-foreground">
          {{ t('settings.machines.version_unknown_short') }}
        </dd>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <dt class="flex items-center gap-1.5 text-meta text-muted-foreground">
          <MessagesSquare class="size-3.5 shrink-0" aria-hidden="true" />{{
            t('settings.machines.open_chats')
          }}
        </dt>
        <dd class="text-small tabular-nums">{{ openChats }}</dd>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <dt class="flex items-center gap-1.5 text-meta text-muted-foreground">
          <Clock class="size-3.5 shrink-0" aria-hidden="true" />{{
            t('settings.machines.answered')
          }}
        </dt>
        <dd v-if="group.state === 'loading'">
          <Skeleton class="mt-0.5 h-4 w-20" />
        </dd>
        <dd v-else class="motion-fade-in truncate text-small">{{ answered }}</dd>
      </div>
    </dl>

    <section
      class="flex flex-col gap-2 border-t border-border pt-3"
      :aria-label="t('settings.machines.accounts_title')"
    >
      <h3 class="flex items-center justify-between gap-2 text-meta text-muted-foreground">
        {{ t('settings.machines.accounts_title') }}
        <span v-if="group.state === 'ready'" class="tabular-nums">{{
          t('settings.machines.accounts', group.offeredCards.length)
        }}</span>
      </h3>
      <div v-if="group.state === 'loading'" class="flex gap-1.5">
        <Skeleton v-for="n in SKELETON_CHIPS" :key="n" class="h-6 w-28 rounded-full" />
      </div>
      <NchSectionEmpty
        v-else-if="group.state === 'failed'"
        :icon="ServerOff"
        :title="failedTitle"
        :hint="failedHint"
        class="motion-shake"
      >
        <!-- A host gets the assistant, which finds the cause; this PC has none, only a retry. -->
        <Button
          v-if="entry"
          variant="outline"
          size="sm"
          class="motion-press mt-1.5 self-start"
          @click="emit('check')"
        >
          <Wrench class="size-4" aria-hidden="true" />{{ t('settings.machines.fix') }}
        </Button>
        <Button
          v-else
          variant="outline"
          size="sm"
          class="motion-press mt-1.5 self-start"
          @click="emit('retry')"
        >
          {{ t('settings.accounts.retry') }}
        </Button>
      </NchSectionEmpty>
      <NchSectionEmpty
        v-else-if="!group.offeredCards.length"
        :icon="UserPlus"
        :title="t('settings.machines.no_accounts_title')"
        :hint="t('settings.machines.no_accounts')"
      />
      <ul v-else class="motion-fade-in flex flex-wrap gap-1.5">
        <li v-for="card in group.offeredCards" :key="card.profile.dir" class="min-w-0">
          <AccountChip
            :account-key="card.accountKey"
            :label="accountNameOf(card.profile)"
            :plan="card.plan"
          />
        </li>
      </ul>
      <p v-if="group.state === 'ready' && version.state === 'none'" class="text-meta text-warning">
        {{ versionUnknownHint }}
      </p>
    </section>

    <footer
      v-if="entry"
      class="mt-auto flex flex-wrap justify-end gap-2 border-t border-border pt-3"
    >
      <Button variant="ghost" size="sm" @click="emit('remove')">
        <Trash2 class="size-4" aria-hidden="true" />{{ t('settings.machines.remove') }}
      </Button>
      <Button variant="ghost" size="sm" @click="emit('edit')">
        <SlidersHorizontal class="size-4" aria-hidden="true" />{{ t('settings.machines.edit') }}
      </Button>
      <Button
        v-if="group.state !== 'failed'"
        variant="outline"
        size="sm"
        class="motion-press"
        @click="emit('check')"
      >
        <PlugZap class="size-4" aria-hidden="true" />{{ t('settings.machines.check') }}
      </Button>
    </footer>
  </article>
</template>
