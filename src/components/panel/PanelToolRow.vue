<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatElapsed } from '@/utils/elapsed'
import type { ToolRun } from '@/utils/tabActivity'
import { TOOL_ICON, TOOL_KIND_CLASS, TOOL_RUN_LOOK } from '@/utils/toolIcons'
import { toolInfoOf } from '@/utils/toolKind'

// One tool call in the panel; clicking it scrolls the chat to its card. `now`: the call still
// runs, its time counts up to this.
const { run, now = null } = defineProps<{ run: ToolRun; now?: number | null }>()
const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()

const info = computed(() => toolInfoOf(run.name))
const duration = computed(() => {
  const end = run.finishedAt ?? now
  return run.startedAt === null || end === null ? '' : formatElapsed(end - run.startedAt)
})
</script>

<template>
  <button
    type="button"
    class="motion-press flex w-full items-center gap-2 rounded-sm py-1 text-left text-meta outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
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
      :class="TOOL_KIND_CLASS[info.kind]"
      aria-hidden="true"
    />
    <span class="shrink-0 font-semibold text-foreground">{{ run.name }}</span>
    <span class="min-w-0 flex-1 truncate font-mono text-muted-foreground">{{ run.target }}</span>
    <span v-if="duration" class="shrink-0 text-muted-foreground tabular-nums">{{ duration }}</span>
  </button>
</template>
