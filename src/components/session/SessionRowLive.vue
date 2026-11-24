<script setup lang="ts">
import SessionRowBadges from '@/components/session/SessionRowBadges.vue'

// The live column of the wide overview: what Claude does right now, and right of it the subagent
// and shell badges. The narrow row splits the two: badges in its meta line, activity below.
// The id is fixed: the row keys this by its tab.
const { tabId, activity } = defineProps<{ tabId: string; activity: string }>()
</script>

<template>
  <span class="flex min-w-0 items-center gap-2 text-meta text-muted-foreground">
    <span class="min-w-0 flex-1 truncate font-mono">{{ activity }}</span>
    <SessionRowBadges :tab-id />
  </span>
</template>
