<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import ChatContextDetails from '@/components/chat/ChatContextDetails.vue'
import { useContextUsageStore } from '@/stores/contextUsage'

// On a phone the composer has no ring to anchor a popover; `/context` and the hint open this sheet.
const { tabId } = defineProps<{ tabId: string }>()

const { t } = useI18n()
const store = useContextUsageStore()

const isOpen = computed({
  get: () => store.openTabId === tabId,
  set: (isNowOpen) => (isNowOpen ? store.openContext(tabId) : store.closeContext())
})
</script>

<template>
  <NchResponsiveDialog
    v-model:open="isOpen"
    :title="t('context.title')"
    :description="t('context.description')"
  >
    <ChatContextDetails :tab-id="tabId" />
  </NchResponsiveDialog>
</template>
