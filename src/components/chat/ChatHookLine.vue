<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { ChevronDown, Webhook } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { HookOutcome } from '@/types/agentd.type'

// A hook that stopped a call, failed or printed something (Figma "36"): a line with a rail on the
// left, its name and what it said. Folded it shows the first line of that, open all of it and the
// hook's command where Claude Code names it.
const {
  event,
  tool = null,
  outcome,
  text,
  command = null
} = defineProps<{
  event: string
  tool?: string | null
  outcome: HookOutcome
  text: string
  command?: string | null
}>()

const isOpen = ref(false)

const { t } = useI18n()
const bodyId = useId()

const title = computed(() => {
  if (outcome === 'blocked')
    return tool ? t('chat.hook.blocked_tool', { event, tool }) : t('chat.hook.blocked', { event })
  if (outcome === 'failed') return t('chat.hook.failed', { event })
  return tool ? t('chat.hook.output_tool', { event, tool }) : t('chat.hook.output', { event })
})
const isAlarm = computed(() => outcome !== 'output')
</script>

<template>
  <div
    class="flex w-full flex-col gap-1 border-l-2 py-1 pl-3"
    :class="isAlarm ? 'border-critical' : 'border-border'"
  >
    <button
      type="button"
      class="flex w-full min-w-0 items-center gap-2 rounded-sm text-left text-small outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :aria-expanded="isOpen"
      :aria-controls="bodyId"
      @click="isOpen = !isOpen"
    >
      <Webhook
        class="size-4 shrink-0"
        :class="isAlarm ? 'text-critical' : 'text-muted-foreground'"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 truncate font-medium">{{ title }}</span>
      <ChevronDown
        class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out"
        :class="{ 'rotate-180': isOpen }"
        aria-hidden="true"
      />
    </button>
    <div :id="bodyId" class="flex flex-col gap-1 font-mono text-meta text-subtle">
      <p :class="isOpen ? 'break-words whitespace-pre-wrap' : 'truncate'">{{ text }}</p>
      <p v-if="isOpen && command" class="break-all text-muted-foreground">
        <span class="font-sans">{{ t('chat.hook.command') }}:</span> {{ command }}
      </p>
    </div>
  </div>
</template>
