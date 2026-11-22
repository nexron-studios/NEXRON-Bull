<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import PanelActivity from '@/components/panel/PanelActivity.vue'
import PanelBackground from '@/components/panel/PanelBackground.vue'
import PanelChangedFiles from '@/components/panel/PanelChangedFiles.vue'
import PanelSubagents from '@/components/panel/PanelSubagents.vue'
import type { ChatTabState } from '@/utils/chatTab'

// The phone's view of what the desktop panel shows about the running turn (Figma "M21"), opened
// from the thinking bar. Jumping to a tool card closes it, so the chat is in view.
const { tab } = defineProps<{ tab: ChatTabState }>()

const open = defineModel<boolean>('open', { required: true })

// A jump to a card puts focus on it; closing must not pull it back to the thinking bar.
const hasNavigated = ref(false)

const { t } = useI18n()

const navigate = () => {
  hasNavigated.value = true
  open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) hasNavigated.value = false
})
</script>

<template>
  <NchResponsiveDialog
    v-model:open="open"
    :title="t('activity.title')"
    :description="t('activity.sheet_hint')"
    :restores-focus="!hasNavigated"
  >
    <!-- The sheet is as dark as the muted tiles of the empty states; they step up one surface. -->
    <div
      class="flex flex-col gap-4 divide-y divide-border [--section-tile:var(--accent)] *:pb-4 *:last:pb-0"
    >
      <PanelActivity :tab :title="t('activity.steps')" is-entering @navigate="navigate" />
      <PanelSubagents :tab is-entering />
      <PanelBackground :tab is-entering />
      <PanelChangedFiles :tab is-entering @navigate="navigate" />
    </div>
  </NchResponsiveDialog>
</template>
