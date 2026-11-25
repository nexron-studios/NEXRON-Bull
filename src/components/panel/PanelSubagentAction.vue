<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useClippedTooltip } from '@/composables/useClippedTooltip'
import { formatElapsed } from '@/utils/elapsed'
import type { ToolRun } from '@/utils/tabActivity'
import { TOOL_ICON, TOOL_RUN_LOOK } from '@/utils/toolIcons'
import { toolInfoOf } from '@/utils/toolKind'

// One tool call of a subagent (Figma "10", `.subact`). It has no card in the chat, so it only
// reads: state, tool, target and how long it took or has been running. Name and target are cut
// off like in PanelToolRow, the tooltip shows them in full.
const { run, now } = defineProps<{ run: ToolRun; now: number }>()

// The root is the renderless Tooltip; classes belong on the row.
defineOptions({ inheritAttrs: false })

const nameEl = useTemplateRef<HTMLElement>('name')
const targetEl = useTemplateRef<HTMLElement>('target')

const { t } = useI18n()
const { open, setOpen } = useClippedTooltip([nameEl, targetEl])

const info = computed(() => toolInfoOf(run.name, run.target))
const duration = computed(() => {
  if (run.startedAt === null) return ''
  if (run.finishedAt !== null) return formatElapsed(run.finishedAt - run.startedAt)
  return run.status === 'running' ? formatElapsed(now - run.startedAt) : ''
})
</script>

<template>
  <Tooltip :open @update:open="setOpen">
    <TooltipTrigger as-child>
      <span v-bind="$attrs" class="flex min-w-0 items-center gap-1.5 py-0.5 text-meta">
        <component
          :is="TOOL_RUN_LOOK[run.status].icon"
          class="size-3 shrink-0"
          :class="TOOL_RUN_LOOK[run.status].class"
          aria-hidden="true"
        />
        <span class="sr-only">{{ t(`activity.tool_state.${run.status}`) }}</span>
        <component
          :is="TOOL_ICON[info.icon]"
          class="size-3 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span ref="name" class="max-w-3/5 shrink-0 truncate font-semibold text-foreground">{{
          run.name
        }}</span>
        <span ref="target" class="min-w-0 flex-1 truncate font-mono text-muted-foreground">{{
          run.target
        }}</span>
        <span v-if="duration" class="shrink-0 text-muted-foreground tabular-nums">{{
          duration
        }}</span>
      </span>
    </TooltipTrigger>
    <TooltipContent class="flex max-w-80 flex-col gap-0.5 break-all">
      <span class="font-semibold">{{ run.name }}</span>
      <span v-if="run.target" class="font-mono">{{ run.target }}</span>
    </TooltipContent>
  </Tooltip>
</template>
