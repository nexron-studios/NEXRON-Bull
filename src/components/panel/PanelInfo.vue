<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import PanelActivity from '@/components/panel/PanelActivity.vue'
import PanelBackground from '@/components/panel/PanelBackground.vue'
import PanelChangedFiles from '@/components/panel/PanelChangedFiles.vue'
import PanelConnectors from '@/components/panel/PanelConnectors.vue'
import PanelAccount from '@/components/panel/PanelAccount.vue'
import PanelOpenItems from '@/components/panel/PanelOpenItems.vue'
import PanelSubagents from '@/components/panel/PanelSubagents.vue'
import { useScrollEdges } from '@/composables/useScrollEdges'
import type { ChatTabState } from '@/utils/chatTab'

// Right of the chat (Figma "30", "38b", 42): its account, the points Claude left open, what Claude
// is doing, its subagents and background shells, the connectors and the files it changed. Every
// section keeps its place when empty. A hint below naming the sections still to come read as out
// of place (21.11.2026); the changed files took that room instead. It scrolls under the
// shell's header once open subagents make it taller than the window. Neither the quota (bottom
// left in the sidebar) nor the context (the ring in the composer) is repeated here.
const { tab } = defineProps<{ tab: ChatTabState }>()

const scroller = useTemplateRef<HTMLElement>('scroller')

const { t } = useI18n()
const { hasMoreAbove } = useScrollEdges(scroller)
</script>

<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col border-l border-border">
    <aside
      ref="scroller"
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
      :aria-label="t('panel.label')"
    >
      <div
        class="flex shrink-0 flex-col divide-y divide-border border-b border-border *:shrink-0 *:p-4"
      >
        <PanelAccount :tab />
        <PanelOpenItems :tab />
        <PanelActivity :tab />
        <PanelSubagents :tab />
        <PanelBackground :tab />
        <PanelConnectors :tab />
        <PanelChangedFiles :tab />
      </div>
    </aside>
    <NchScrollEdge edge="top" :is-shown="hasMoreAbove" />
  </div>
</template>
