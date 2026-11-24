<script setup lang="ts">
import { computed } from 'vue'
import { Activity, ChevronRight, Moon, ShieldAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import PanelActivityEmpty from '@/components/panel/PanelActivityEmpty.vue'
import PanelSection from '@/components/panel/PanelSection.vue'
import PanelToolRow from '@/components/panel/PanelToolRow.vue'
import { useChatReveal } from '@/composables/useChatReveal'
import { useRowArrivals } from '@/composables/useRowArrivals'
import { useSecondClock } from '@/composables/useClock'
import { useTabInsights } from '@/composables/useTabInsights'
import type { ChatTabState } from '@/utils/chatTab'
import { lastTurnTextOf } from '@/utils/lastTurn'
import { activityAsideOf, activityViewOf } from '@/utils/panelStates'
import { TOOL_ICON, TOOL_KIND_CLASS } from '@/utils/toolIcons'
import type { RevealBlock } from '@/utils/revealScroll'
import { toolInfoOf } from '@/utils/toolKind'

// What Claude does in this chat (Figma "30", 42e): the calls in progress on top with a spinner, the
// last ones that finished below, or the approval it waits on; before the first call, ghost rows.
// A row scrolls the chat to its card. What Claude thinks or writes right now stays in the status
// line next to the chat. `title`: the phone sheet calls it "Schritte" under its own heading.
const {
  tab,
  title = null,
  isEntering = false
} = defineProps<{
  tab: ChatTabState
  title?: string | null
  /** Shown in a sheet that just opened: every row enters. */
  isEntering?: boolean
}>()
/** The chat came into view; the phone sheet closes on it. */
const emit = defineEmits<{ navigate: [] }>()

const { t } = useI18n()
const { activity } = useTabInsights(tab.id)
const { revealTool, revealApproval } = useChatReveal()

const state = computed(() => activity.value?.state ?? { kind: 'idle' as const, summary: null })
const tools = computed(() => activity.value?.tools ?? [])
const recent = computed(() => activity.value?.recent ?? [])
const isRunning = computed(() => state.value.kind === 'running')
const now = useSecondClock(isRunning)
const view = computed(() => activityViewOf(state.value, tools.value))
const aside = computed(() => activityAsideOf(view.value, tools.value.length))

// Running calls first, then the newest finished ones, the newest on top in both (24.11.2026); one
// list, so a call that finishes keeps its row and slides down instead of entering again.
const rows = computed(() => [
  ...(isRunning.value ? tools.value.filter((tool) => tool.status === 'running') : [])
    .toReversed()
    .map((run) => ({ run, isRunning: true })),
  ...recent.value.map((run) => ({ run, isRunning: false }))
])
const { staggerIndexOf } = useRowArrivals(() => rows.value.map((row) => row.run.id), isEntering)
const waiting = computed(() => {
  if (state.value.kind !== 'waiting') return null
  const { reason, tool, target } = state.value
  const info = toolInfoOf(tool)
  return {
    info,
    title:
      reason === 'approval' ? t('activity.waiting', { tool }) : t(`notifications.reason.${reason}`),
    target: reason === 'approval' ? target : ''
  }
})
// The panel already lists every call of the turn as a row: the link would only repeat them.
const hasHiddenTools = computed(() => tools.value.length > rows.value.length)
const summary = computed(() =>
  view.value.kind === 'done' ? lastTurnTextOf(view.value.summary, t) : null
)

const show = async (toolId: string, block?: RevealBlock) => {
  emit('navigate')
  await revealTool(toolId, block)
}
// The turn's first card at the top: the chat lists every call of the turn from there on.
const showAll = () => {
  const first = tools.value[0]
  if (first) void show(first.id, 'start')
}
const showApproval = async () => {
  emit('navigate')
  await revealApproval(tab.id)
}
</script>

<template>
  <PanelSection :icon="Activity" :title="title ?? t('activity.title')">
    <template #aside>
      <span class="flex items-center gap-2 text-meta text-muted-foreground tabular-nums">
        <span v-if="aside.toolCount">{{ t('activity.tool_count', aside.toolCount) }}</span>
        <span v-if="aside.mark === 'needs-you'" class="flex items-center gap-1 text-critical">
          <span class="size-1.5 rounded-full bg-critical" aria-hidden="true" />
          {{ t('activity.needs_you') }}
        </span>
        <span v-else-if="aside.mark === 'live'" class="flex items-center gap-1 text-warning">
          <span class="size-1.5 rounded-full bg-warning" aria-hidden="true" />
          {{ t('activity.live') }}
        </span>
        <span v-else-if="aside.mark === 'resting'" class="flex items-center gap-1">
          <Moon class="size-3" aria-hidden="true" />
          {{ t('activity.resting') }}
        </span>
      </span>
    </template>

    <template v-if="waiting">
      <div
        class="flex items-center gap-2 rounded-lg border border-critical/50 bg-critical/8 px-2.5 py-2"
      >
        <ShieldAlert class="size-4 shrink-0 text-critical" aria-hidden="true" />
        <component
          :is="TOOL_ICON[waiting.info.icon]"
          class="size-4 shrink-0"
          :class="TOOL_KIND_CLASS[waiting.info.kind]"
          aria-hidden="true"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-small font-semibold">{{ waiting.title }}</span>
          <span v-if="waiting.target" class="truncate font-mono text-meta">
            {{ waiting.target }}
          </span>
        </span>
      </div>
      <button
        type="button"
        class="motion-press flex w-fit items-center gap-0.5 rounded-sm text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        @click="showApproval"
      >
        {{ t('activity.to_approval') }}
        <ChevronRight class="size-3.5" aria-hidden="true" />
      </button>
    </template>
    <PanelActivityEmpty
      v-else-if="view.kind === 'fresh' || view.kind === 'thinking' || view.kind === 'answered'"
      :view
    />
    <p v-else-if="summary" class="text-small text-muted-foreground">{{ summary }}</p>

    <TransitionGroup
      v-if="rows.length"
      tag="ul"
      move-class="panel-row-move"
      class="-my-1 flex flex-col"
    >
      <li
        v-for="row in rows"
        :key="row.run.id"
        :class="{ 'motion-stagger': staggerIndexOf(row.run.id) !== null }"
        :style="{ '--stagger-index': staggerIndexOf(row.run.id) ?? undefined }"
      >
        <PanelToolRow
          :run="row.run"
          :now="row.isRunning ? now.getTime() : null"
          @open="show(row.run.id)"
        />
      </li>
    </TransitionGroup>
    <button
      v-if="hasHiddenTools"
      type="button"
      class="motion-press flex w-fit items-center gap-0.5 rounded-sm text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      @click="showAll"
    >
      {{ t('activity.show_all', tools.length) }}
      <ChevronRight class="size-3.5" aria-hidden="true" />
    </button>
  </PanelSection>
</template>
