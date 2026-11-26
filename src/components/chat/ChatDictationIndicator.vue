<script setup lang="ts">
import { computed } from 'vue'
import { LoaderCircle, Mic, MicOff } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { DictationIndicator } from '@/utils/dictation'

// While Space dictates: a small pill in the composer's bottom row. Only the dot of a running
// recording pulses, and only without reduced motion.
const { kind } = defineProps<{ kind: DictationIndicator }>()

const { t } = useI18n()

const labelKeyOf = (indicator: DictationIndicator): string => {
  switch (indicator) {
    case 'arming':
      return 'chat.dictation.starting'
    case 'recording':
      return 'chat.dictation.listening'
    case 'transcribing':
      return 'chat.dictation.transcribing'
    case 'error':
      return 'chat.dictation.nothing_heard'
    default: {
      const unhandled: never = indicator
      throw new Error(`Unhandled dictation indicator: ${unhandled}`)
    }
  }
}

const label = computed(() => t(labelKeyOf(kind)))
</script>

<template>
  <span
    role="status"
    class="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-meta"
    :class="kind === 'error' ? 'text-muted-foreground' : 'bg-brand/10 text-foreground'"
  >
    <MicOff v-if="kind === 'error'" class="size-3.5" aria-hidden="true" />
    <LoaderCircle
      v-else-if="kind === 'transcribing'"
      class="size-3.5 motion-safe:animate-spin"
      aria-hidden="true"
    />
    <Mic v-else class="size-3.5 text-brand" aria-hidden="true" />
    <span
      v-if="kind === 'recording'"
      class="size-1.5 shrink-0 rounded-full bg-destructive motion-safe:animate-pulse"
      aria-hidden="true"
    />
    {{ label }}
  </span>
</template>
