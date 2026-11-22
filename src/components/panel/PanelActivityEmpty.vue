<script setup lang="ts">
import { computed } from 'vue'
import { ListTree, MessageSquareText, Sparkles } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import PanelGhostRows from '@/components/panel/PanelGhostRows.vue'
import NchSectionEmpty from '@/components/common/NchSectionEmpty.vue'
import { useMinuteClock } from '@/composables/useClock'
import { answeredTurnTextOf } from '@/utils/lastTurn'
import type { ActivityView } from '@/utils/panelStates'

// "Aktivität" before there is a call to list (Figma 42e): a new chat, a turn whose first tool has
// not come yet, or a last turn that only answered.
const { view } = defineProps<{
  view: Extract<ActivityView, { kind: 'fresh' | 'thinking' | 'answered' }>
}>()

const { t, locale } = useI18n()
// Past midnight the same turn becomes yesterday's.
const now = useMinuteClock()

const answeredText = computed(() =>
  view.kind === 'answered'
    ? answeredTurnTextOf(view.summary, t, locale.value, now.value.getTime())
    : null
)
</script>

<template>
  <template v-if="view.kind === 'answered'">
    <NchSectionEmpty
      :icon="MessageSquareText"
      :title="t('activity.answered')"
      :hint="answeredText"
      tone="good"
    />
    <p class="text-meta text-muted-foreground">{{ t('activity.answered_hint') }}</p>
  </template>
  <template v-else>
    <PanelGhostRows :is-live="view.kind === 'thinking'" />
    <!-- Writing an answer without a tool so far: the same ghost rows, but no "still thinking". -->
    <NchSectionEmpty
      v-if="view.kind === 'thinking'"
      :icon="Sparkles"
      :title="t(view.isWriting ? 'activity.writing' : 'activity.thinking')"
      :hint="t('activity.thinking_hint')"
    />
    <NchSectionEmpty
      v-else
      :icon="ListTree"
      :title="t('activity.fresh')"
      :hint="t('activity.fresh_hint')"
    />
  </template>
</template>
