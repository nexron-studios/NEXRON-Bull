<script setup lang="ts">
import { computed } from 'vue'
import { Bot } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import PanelSection from '@/components/panel/PanelSection.vue'
import NchSectionEmpty from '@/components/common/NchSectionEmpty.vue'
import PanelSubagentGhostRows from '@/components/panel/PanelSubagentGhostRows.vue'
import PanelSubagentRow from '@/components/panel/PanelSubagentRow.vue'
import { useSecondClock } from '@/composables/useClock'
import { useRowArrivals } from '@/composables/useRowArrivals'
import { useSubagentActions } from '@/composables/useSubagentActions'
import { useTabInsights } from '@/composables/useTabInsights'
import type { ChatTabState } from '@/utils/chatTab'

// The subagents of the shown turn plus older ones still running, running first in the order
// Claude started them, each with its own tool calls (Figma "10", "21"). Before the first one,
// ghost agents hold about the room one or two real ones take.
const { tab, isEntering = false } = defineProps<{
  tab: ChatTabState
  /** Shown in a sheet that just opened: every row enters. */
  isEntering?: boolean
}>()

const { t } = useI18n()
const { turnSubagents: subagents, runningSubagents } = useTabInsights(tab.id)
const { actions } = useSubagentActions(() => tab)
// Finished agents have a fixed duration; the clock only runs while one is still going.
const now = useSecondClock(() => runningSubagents.value.length > 0)

const finishedCount = computed(() => subagents.value.length - runningSubagents.value.length)
const rows = computed(() =>
  [...subagents.value].sort(
    (a, b) => Number(b.status === 'running') - Number(a.status === 'running')
  )
)
const { staggerIndexOf } = useRowArrivals(() => rows.value.map((agent) => agent.id), isEntering)
</script>

<template>
  <PanelSection :icon="Bot" :title="t('panel.subagents')">
    <template v-if="rows.length" #aside>
      <span class="text-meta text-muted-foreground tabular-nums">
        <span v-if="runningSubagents.length" class="text-warning">
          {{ t('activity.subagents_running', runningSubagents.length) }}
        </span>
        <template v-if="runningSubagents.length && finishedCount"> · </template>
        <template v-if="finishedCount">
          {{ t('activity.subagents_done', { n: finishedCount }) }}
        </template>
      </span>
    </template>
    <ul v-if="rows.length" class="flex flex-col gap-2.5 text-small">
      <PanelSubagentRow
        v-for="agent in rows"
        :key="agent.id"
        :class="{ 'motion-stagger': staggerIndexOf(agent.id) !== null }"
        :style="{ '--stagger-index': staggerIndexOf(agent.id) ?? undefined }"
        :agent
        :actions="actions[agent.id] ?? []"
        :now="now.getTime()"
      />
    </ul>
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
