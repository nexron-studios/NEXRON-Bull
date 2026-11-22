<script setup lang="ts">
import { computed, ref } from 'vue'
import { PlugZap, Server } from '@lucide/vue'
import { useQuery } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import { machineService } from '@/api/services/machine.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { MachineEntry } from '@/types/machine.type'
import {
  machineEntryOf,
  machineFormOf,
  machineFormProblemOf,
  type MachineForm
} from '@/utils/machineAssistant'

// The first step of the assistant: which machine. Hosts from ~/.ssh/config are one click away;
// any other is typed in, with user and port only when ssh needs them.
const {
  initial,
  takenNames,
  hasName = true
} = defineProps<{
  initial: MachineEntry | null
  /** Names of the machines Bull lists, without the one being changed */
  takenNames: string[]
  /** A listed machine keeps its own name; the card renames what Bull shows. */
  hasName?: boolean
}>()

const emit = defineEmits<{ check: [entry: MachineEntry]; cancel: [] }>()

const SKELETON_CHIPS = 2

const form = ref<MachineForm>(
  initial ? machineFormOf(initial) : { host: '', user: '', port: '', name: '' }
)
const isSubmitted = ref(false)

const { t } = useI18n()
const suggestions = useQuery({
  queryKey: ['machines', 'suggestions'],
  queryFn: machineService.suggestions,
  staleTime: 0
})

const problem = computed(() => machineFormProblemOf(form.value, takenNames))
const shownProblem = computed(() => (isSubmitted.value ? problem.value : null))
const problemField = computed(() =>
  shownProblem.value === 'port' ? 'port' : shownProblem.value === 'name_taken' ? 'name' : 'host'
)

const pick = (host: string) => {
  form.value = { host, user: '', port: '', name: '' }
}

const submit = () => {
  isSubmitted.value = true
  if (problem.value) {
    document.getElementById(`machine-${problemField.value}`)?.focus()
    return
  }
  emit('check', machineEntryOf(form.value))
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
    <section
      v-if="suggestions.isPending.value || suggestions.data.value?.length"
      class="flex flex-col gap-1.5"
      :aria-label="t('settings.machines.assistant.suggestions')"
    >
      <span class="text-small font-medium">{{ t('settings.machines.assistant.suggestions') }}</span>
      <div v-if="suggestions.isPending.value" class="flex gap-1.5">
        <Skeleton v-for="n in SKELETON_CHIPS" :key="n" class="h-8 w-28 rounded-full" />
      </div>
      <ul v-else class="motion-fade-in flex flex-wrap gap-1.5">
        <li v-for="host in suggestions.data.value" :key="host">
          <Button
            type="button"
            size="sm"
            :variant="form.host === host ? 'default' : 'outline'"
            class="motion-press rounded-full"
            :aria-pressed="form.host === host"
            @click="pick(host)"
          >
            <Server class="size-3.5" aria-hidden="true" />{{ host }}
          </Button>
        </li>
      </ul>
    </section>

    <div class="flex flex-col gap-1.5">
      <Label for="machine-host">{{ t('settings.machines.assistant.host') }}</Label>
      <Input
        id="machine-host"
        v-model="form.host"
        name="machine-host"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        class="font-mono"
        :aria-invalid="problemField === 'host' && !!shownProblem"
        aria-describedby="machine-host-hint"
      />
      <p
        id="machine-host-hint"
        class="text-meta"
        :class="problemField === 'host' && shownProblem ? 'text-critical' : 'text-muted-foreground'"
        :role="problemField === 'host' && shownProblem ? 'alert' : undefined"
      >
        {{
          problemField === 'host' && shownProblem
            ? t(`settings.machines.assistant.problems.${shownProblem}`)
            : t('settings.machines.assistant.host_hint')
        }}
      </p>
    </div>

    <div class="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
      <div class="flex min-w-0 flex-col gap-1.5">
        <Label for="machine-user">{{ t('settings.machines.assistant.user') }}</Label>
        <Input
          id="machine-user"
          v-model="form.user"
          name="machine-user"
          autocomplete="username"
          autocapitalize="off"
          spellcheck="false"
          class="font-mono"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="machine-port">{{ t('settings.machines.assistant.port') }}</Label>
        <Input
          id="machine-port"
          v-model="form.port"
          name="machine-port"
          inputmode="numeric"
          autocomplete="off"
          placeholder="22"
          class="font-mono tabular-nums"
          :aria-invalid="problemField === 'port' && !!shownProblem"
        />
      </div>
      <p
        class="col-span-2 text-meta"
        :class="problemField === 'port' && shownProblem ? 'text-critical' : 'text-muted-foreground'"
        :role="problemField === 'port' && shownProblem ? 'alert' : undefined"
      >
        {{
          problemField === 'port' && shownProblem
            ? t('settings.machines.assistant.problems.port')
            : `${t('settings.machines.assistant.user_hint')} ${t('settings.machines.assistant.port_hint')}`
        }}
      </p>
    </div>

    <div v-if="hasName" class="flex flex-col gap-1.5">
      <Label for="machine-name">{{ t('settings.machines.assistant.name') }}</Label>
      <Input
        id="machine-name"
        v-model="form.name"
        name="machine-name"
        autocomplete="off"
        :placeholder="form.host.trim()"
        :aria-invalid="problemField === 'name' && !!shownProblem"
        aria-describedby="machine-name-hint"
      />
      <p
        id="machine-name-hint"
        class="text-meta"
        :class="problemField === 'name' && shownProblem ? 'text-critical' : 'text-muted-foreground'"
        :role="problemField === 'name' && shownProblem ? 'alert' : undefined"
      >
        {{
          problemField === 'name' && shownProblem
            ? t('settings.machines.assistant.problems.name_taken')
            : t('settings.machines.assistant.name_hint')
        }}
      </p>
    </div>

    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
      <Button type="button" variant="outline" @click="emit('cancel')">{{
        t('global.cancel')
      }}</Button>
      <Button type="submit" class="motion-press">
        <PlugZap class="size-4" aria-hidden="true" />{{ t('settings.machines.assistant.check') }}
      </Button>
    </div>
  </form>
</template>
