<script setup lang="ts">
import SessionRowBackground from '@/components/session/SessionRowBackground.vue'
import SessionRowBadges from '@/components/session/SessionRowBadges.vue'
import type { BackgroundTask } from '@/utils/tabInsights'

// The live column of the wide overview: what Claude does right now, and right of it the subagent
// and shell badges. The narrow row splits the two: badges in its meta line, activity below.
// The id is fixed: the row keys this by its tab.
const { tabId, activity, background } = defineProps<{
  tabId: string
  activity: string
  /** Shells or agents still running after the turn; shown when there is no activity */
  background: BackgroundTask[]
}>()
</script>

<template>
  <span class="flex min-w-0 items-center gap-2 text-meta text-muted-foreground">
    <span v-if="activity || !background.length" class="min-w-0 flex-1 truncate font-mono">
      {{ activity }}
    </span>
    <SessionRowBackground v-else :tasks="background" class="flex-1" />
    <SessionRowBadges :tab-id />
  </span>
</template>
