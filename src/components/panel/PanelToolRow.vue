<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useClippedTooltip } from '@/composables/useClippedTooltip'
import { formatElapsed } from '@/utils/elapsed'
import type { ToolRun } from '@/utils/tabActivity'
import { SKILL_ROW_TINT, TOOL_ICON, TOOL_RUN_LOOK } from '@/utils/toolIcons'
import { toolInfoOf } from '@/utils/toolKind'

// One tool call in the panel; clicking it scrolls the chat to its card. `now`: the call still
// runs, its time counts up to this. A long name (MCP tools) or target is cut off, the tooltip then
// shows both in full. Only the state icon has colour; the tool icon stays grey, so several calls
// at once do not turn the panel colourful (same in subagent actions and ghost rows). A skill is
// the exception: orange icon on a tinted row, so a running code review is seen at a glance.
const { run, now = null } = defineProps<{ run: ToolRun; now?: number | null }>()
const emit = defineEmits<{ open: [] }>()

const nameEl = useTemplateRef<HTMLElement>('name')
const targetEl = useTemplateRef<HTMLElement>('target')

const { t } = useI18n()
const { open, setOpen } = useClippedTooltip([nameEl, targetEl])

const info = computed(() => toolInfoOf(run.name, run.target))
const isSkill = computed(() => info.value.kind === 'skill')
const duration = computed(() => {
  const end = run.finishedAt ?? now
  return run.startedAt === null || end === null ? '' : formatElapsed(end - run.startedAt)
})
</script>

<template>
  <Tooltip :open @update:open="setOpen">
    <TooltipTrigger as-child>
      <button
        type="button"
        class="motion-press flex w-full min-w-0 items-center gap-2 rounded-sm py-1 text-left text-meta outline-none select-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
        :class="isSkill && [SKILL_ROW_TINT, '-mx-1 w-[calc(100%+0.5rem)] px-1']"
        @click="emit('open')"
      >
        <component
          :is="TOOL_RUN_LOOK[run.status].icon"
          class="size-3.5 shrink-0"
          :class="TOOL_RUN_LOOK[run.status].class"
          aria-hidden="true"
        />
        <span class="sr-only">{{ t(`activity.tool_state.${run.status}`) }}</span>
        <component
          :is="TOOL_ICON[info.icon]"
          class="size-3.5 shrink-0"
          :class="isSkill ? 'text-clawd' : 'text-muted-foreground'"
          aria-hidden="true"
        />
        <!-- The name keeps at most three fifths, so a long MCP name leaves room for the target. -->
        <span ref="name" class="max-w-3/5 shrink-0 truncate font-semibold text-foreground">{{
          run.name
        }}</span>
        <span ref="target" class="min-w-0 flex-1 truncate font-mono text-muted-foreground">{{
          run.target
        }}</span>
        <span v-if="duration" class="shrink-0 text-muted-foreground tabular-nums">{{
          duration
        }}</span>
      </button>
    </TooltipTrigger>
    <TooltipContent class="flex max-w-80 flex-col gap-0.5 break-all">
      <span class="font-semibold">{{ run.name }}</span>
      <span v-if="run.target" class="font-mono">{{ run.target }}</span>
    </TooltipContent>
  </Tooltip>
</template>
