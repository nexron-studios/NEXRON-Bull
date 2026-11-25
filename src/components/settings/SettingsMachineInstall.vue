<script setup lang="ts">
import { computed } from 'vue'
import { Check, Circle, CircleX, LoaderCircle, Pencil, RefreshCw } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import type { InstallError, InstallStep, MachineEntry } from '@/types/machine.type'
import { installStepsOf } from '@/utils/machineAssistant'

// Installing agentd: the four steps with the one that runs, or why it stopped and the way on.
const {
  entry,
  current = null,
  failure = null
} = defineProps<{
  entry: MachineEntry
  current?: InstallStep | null
  failure?: InstallError | null
}>()

const emit = defineEmits<{ retry: []; back: [] }>()

const { t } = useI18n()

const steps = computed(() => (current ? installStepsOf(current) : []))
const failureText = computed(() => {
  if (!failure) return ''
  switch (failure.kind) {
    case 'tabs_running':
      return t(
        'settings.machines.assistant.failures.tabs_running',
        { machine: entry.name, count: failure.count },
        failure.count
      )
    case 'tabs_unknown':
      return t('settings.machines.assistant.failures.tabs_unknown', { machine: entry.name })
    case 'check_failed':
      return t(`settings.machines.reasons.${failure.reason}.hint`, { machine: entry.name })
    case 'own_agentd_missing':
      return t('settings.machines.assistant.failures.own_agentd_missing')
    case 'copy_failed':
      return t('settings.machines.assistant.failures.copy_failed')
    case 'download_failed':
      return t('settings.machines.assistant.failures.download_failed', {
        machine: entry.name,
        url: failure.url
      })
    case 'invalid':
      return t('settings.machines.assistant.failures.invalid')
    default: {
      const unhandled: never = failure
      throw new Error(`Unhandled install failure: ${JSON.stringify(unhandled)}`)
    }
  }
})
const failureDetail = computed(() =>
  failure && 'detail' in failure && failure.detail ? failure.detail : null
)
</script>

<template>
  <div v-if="failure" class="motion-fade-in flex flex-col gap-4">
    <div class="motion-shake flex items-start gap-3" role="alert">
      <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-warning/12 text-warning">
        <CircleX class="size-5" aria-hidden="true" />
      </span>
      <div class="flex min-w-0 flex-col gap-0.5">
        <p class="font-semibold">{{ t('settings.machines.assistant.failed_title') }}</p>
        <p class="text-small text-muted-foreground">{{ failureText }}</p>
      </div>
    </div>
    <pre
      v-if="failureDetail"
      class="rounded-lg bg-muted p-2 font-mono text-meta break-all whitespace-pre-wrap text-muted-foreground"
      >{{ failureDetail }}</pre>
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
      <Button variant="ghost" @click="emit('back')">
        <Pencil class="size-4" aria-hidden="true" />{{ t('settings.machines.assistant.back') }}
      </Button>
      <Button class="motion-press" @click="emit('retry')">
        <RefreshCw class="size-4" aria-hidden="true" />{{ t('settings.accounts.retry') }}
      </Button>
    </div>
  </div>

  <div v-else class="flex flex-col gap-3">
    <p class="font-semibold" role="status">
      {{ t('settings.machines.assistant.installing', { machine: entry.name }) }}
    </p>
    <ol class="flex flex-col gap-2">
      <li
        v-for="(item, index) in steps"
        :key="item.step"
        class="motion-stagger flex items-center gap-2.5 text-small"
        :class="item.state === 'waiting' && 'text-muted-foreground'"
        :style="{ '--stagger-index': index }"
        :aria-current="item.state === 'running' ? 'step' : undefined"
      >
        <span
          class="grid size-6 shrink-0 place-items-center rounded-full"
          :class="item.state === 'done' ? 'bg-good/12 text-good' : 'bg-muted'"
        >
          <Check v-if="item.state === 'done'" class="motion-pop size-3.5" aria-hidden="true" />
          <LoaderCircle
            v-else-if="item.state === 'running'"
            class="size-3.5 motion-safe:animate-spin"
            aria-hidden="true"
          />
          <Circle v-else class="size-2.5" aria-hidden="true" />
        </span>
        {{ t(`settings.machines.assistant.steps.${item.step}`) }}
      </li>
    </ol>
  </div>
</template>
