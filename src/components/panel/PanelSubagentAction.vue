<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatElapsed } from '@/utils/elapsed'
import type { ToolRun } from '@/utils/tabActivity'
import { TOOL_ICON, TOOL_KIND_CLASS, TOOL_RUN_LOOK } from '@/utils/toolIcons'
import { toolInfoOf } from '@/utils/toolKind'

// One tool call of a subagent (Figma "10", `.subact`). It has no card in the chat, so it only
// reads: state, tool, target and how long it took or has been running.
const { run, now } = defineProps<{ run: ToolRun; now: number }>()

const { t } = useI18n()

const info = computed(() => toolInfoOf(run.name))
const duration = computed(() => {
  if (run.startedAt === null) return ''
  if (run.finishedAt !== null) return formatElapsed(run.finishedAt - run.startedAt)
  return run.status === 'running' ? formatElapsed(now - run.startedAt) : ''
})
</script>

<template>
  <span class="flex min-w-0 items-center gap-1.5 py-0.5 text-meta">
    <component
      :is="TOOL_RUN_LOOK[run.status].icon"
      class="size-3 shrink-0"
      :class="TOOL_RUN_LOOK[run.status].class"
      aria-hidden="true"
    />
    <span class="sr-only">{{ t(`activity.tool_state.${run.status}`) }}</span>
    <component
      :is="TOOL_ICON[info.icon]"
      class="size-3 shrink-0"
      :class="TOOL_KIND_CLASS[info.kind]"
      aria-hidden="true"
    />
    <span class="shrink-0 font-semibold text-foreground">{{ run.name }}</span>
    <span class="min-w-0 flex-1 truncate font-mono text-muted-foreground">{{ run.target }}</span>
    <span v-if="duration" class="shrink-0 text-muted-foreground tabular-nums">{{ duration }}</span>
  </span>
</template>
