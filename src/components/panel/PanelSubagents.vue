<script setup lang="ts">
import { computed, useId } from 'vue'
import { Bot } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import PanelFoldedList from '@/components/panel/PanelFoldedList.vue'
import PanelSection from '@/components/panel/PanelSection.vue'
import NchSectionEmpty from '@/components/common/NchSectionEmpty.vue'
import PanelSubagentGhostRows from '@/components/panel/PanelSubagentGhostRows.vue'
import PanelSubagentRow from '@/components/panel/PanelSubagentRow.vue'
import { useSecondClock } from '@/composables/useClock'
import { useFoldedRows } from '@/composables/useFoldedRows'
import { useRowArrivals } from '@/composables/useRowArrivals'
import { useSubagentActions } from '@/composables/useSubagentActions'
import { useTabInsights } from '@/composables/useTabInsights'
import type { ChatTabState } from '@/utils/chatTab'

// The subagents of the shown turn plus older ones still running, each with its own tool calls
// (Figma "10", "21"): running first, the newest on top (24.11.2026), folded after five like the
// other panel lists. Before the first one, ghost agents hold about the room one or two real ones
// take. Agents come, go and change their height while they work: every row grows and shrinks in
// place (`row-grow`), and the 10 px between them is the bottom padding of each row, taken back
// under the last one, since a gap would snap.
const { tab, isEntering = false } = defineProps<{
  tab: ChatTabState
  /** Shown in a sheet that just opened: every row enters. */
  isEntering?: boolean
}>()

const EXPANDED_STORAGE_KEY = 'bull.panel.subagents_expanded'

const { t } = useI18n()
const listId = useId()
const { turnSubagents: subagents } = useTabInsights(tab.id)
const { actions } = useSubagentActions(() => tab)
const runningCount = computed(
  () => subagents.value.filter((agent) => agent.status === 'running').length
)
// Finished agents have a fixed duration; the clock only runs while one is still going.
const now = useSecondClock(() => runningCount.value > 0)

const finishedCount = computed(() => subagents.value.length - runningCount.value)
const rows = computed(() =>
  subagents.value.toSorted(
    (a, b) =>
      Number(b.status === 'running') - Number(a.status === 'running') ||
      (b.startedAt ?? 0) - (a.startedAt ?? 0)
  )
)
const fold = useFoldedRows(rows, EXPANDED_STORAGE_KEY)
const { staggerIndexOf, settle } = useRowArrivals(
  () => fold.shown.value.map((agent) => agent.id),
  isEntering
)

const toggle = () => {
  settle()
  fold.toggle()
}
</script>

<template>
  <PanelSection :icon="Bot" :title="t('panel.subagents')">
    <template v-if="rows.length" #aside>
      <span class="text-meta text-muted-foreground tabular-nums">
        <span v-if="runningCount" class="text-warning">
          {{ t('activity.subagents_running', runningCount) }}
        </span>
        <template v-if="runningCount && finishedCount"> · </template>
        <template v-if="finishedCount">
          {{ t('activity.subagents_done', { n: finishedCount }) }}
        </template>
      </span>
    </template>
    <PanelFoldedList
      v-if="rows.length"
      :is-expanded="fold.isExpanded.value"
      :is-foldable="fold.isFoldable.value"
      :hidden-count="fold.hiddenCount.value"
      :controls="listId"
      :is-capped="false"
      @toggle="toggle"
    >
      <TransitionGroup
        :id="listId"
        tag="ul"
        name="row-grow"
        move-class="panel-row-move"
        class="-mb-2.5 flex flex-col text-small"
      >
        <PanelSubagentRow
          v-for="agent in fold.shown.value"
          :key="agent.id"
          :class="{ 'motion-stagger': staggerIndexOf(agent.id) !== null }"
          :style="{ '--stagger-index': staggerIndexOf(agent.id) ?? undefined }"
          :agent
          :actions="actions[agent.id] ?? []"
          :now="now.getTime()"
        />
      </TransitionGroup>
    </PanelFoldedList>
    <template v-else>
      <PanelSubagentGhostRows />
      <NchSectionEmpty
        :icon="Bot"
        :title="t('panel.subagents_empty')"
        :hint="t('panel.subagents_empty_hint')"
      />
    </template>
  </PanelSection>
</template>
