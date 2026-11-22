<script setup lang="ts">
import { computed } from 'vue'
import { DollarSign, LoaderCircle, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { MS_PER_SECOND } from '@/utils/elapsed'

// Figma 32b: a command run with `!`, its output below, in the turquoise of what runs outside
// Claude. `sent`: it went to Claude with a prompt; otherwise it waits for the next one.
export type ShellBlockState = 'running' | 'done' | 'failed' | 'sent'

const {
  command,
  state,
  stdout = '',
  stderr = '',
  code = null,
  durationMs = null,
  isTimedOut = false,
  error = null,
  isRemovable = false,
  isOutputHere = true
} = defineProps<{
  command: string
  state: ShellBlockState
  stdout?: string
  stderr?: string
  code?: number | null
  durationMs?: number | null
  isTimedOut?: boolean
  error?: string | null
  isRemovable?: boolean
  /** The terminal writes the output as a message of its own; then this block has none to show */
  isOutputHere?: boolean
}>()
const emit = defineEmits<{ remove: [] }>()

const { t, n } = useI18n()

const seconds = computed(() =>
  durationMs === null
    ? ''
    : n(durationMs / MS_PER_SECOND, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
)
const status = computed(() => {
  if (state === 'running') return t('prompt_input.shell_running')
  if (state === 'sent') return t('prompt_input.shell_sent')
  if (state === 'failed') return ''
  return t('prompt_input.shell_waiting', { seconds: seconds.value })
})
const problem = computed(() => {
  if (state === 'failed') return t('prompt_input.shell_failed', { message: error ?? '' })
  if (isTimedOut) return t('prompt_input.shell_timed_out', { seconds: seconds.value })
  if (code !== null && code !== 0) return t('prompt_input.shell_exit', { code })
  return null
})
const hasOutput = computed(() => !!stdout.trim() || !!stderr.trim())
</script>

<template>
  <div
    class="flex w-full max-w-[72ch] flex-col gap-1.5 self-stretch rounded-xl border border-act-outside/40 bg-card px-3 py-2"
  >
    <div class="flex items-center gap-2">
      <DollarSign class="size-3.5 shrink-0 text-act-outside" aria-hidden="true" />
      <span class="sr-only">{{ t('prompt_input.shell_label') }}:</span>
      <code class="min-w-0 flex-1 truncate font-mono text-small font-semibold">{{ command }}</code>
      <LoaderCircle
        v-if="state === 'running'"
        class="size-3.5 shrink-0 animate-spin text-warning"
        aria-hidden="true"
      />
      <span class="shrink-0 text-meta text-muted-foreground">{{ status }}</span>
      <NchIconButton
        v-if="isRemovable && state !== 'running'"
        :label="t('prompt_input.shell_remove', { command })"
        size="icon-xs"
        class="shrink-0 text-muted-foreground"
        @click="emit('remove')"
      >
        <X aria-hidden="true" />
      </NchIconButton>
    </div>
    <pre
      v-if="hasOutput"
      class="max-h-64 overflow-auto font-mono text-meta whitespace-pre-wrap text-muted-foreground"
    ><span v-if="stdout.trim()">{{ stdout }}</span><span v-if="stdout.trim() && stderr.trim()">
</span><span v-if="stderr.trim()" class="text-critical">{{ stderr }}</span></pre>
    <p
      v-else-if="isOutputHere && (state === 'done' || state === 'sent')"
      class="text-meta text-muted-foreground italic"
    >
      {{ t('prompt_input.shell_no_output') }}
    </p>
    <p v-if="problem" class="text-meta text-critical" role="status">{{ problem }}</p>
  </div>
</template>
