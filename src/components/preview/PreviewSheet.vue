<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import { useIsPhone } from '@/composables/useViewport'
import type { ChatTabState } from '@/utils/chatTab'

// The preview where the chat leaves it no column (a phone, a small window): a bottom sheet on a
// phone, a large dialog wider than that (NchResponsiveDialog). It opens without focusing the
// address field, so a phone keeps its keyboard down; only the phone sheet lacks a close button.
defineProps<{ tab: ChatTabState; isOpen: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const isPhone = useIsPhone()

const handleOpen = (isNowOpen: boolean) => {
  if (!isNowOpen) emit('close')
}
</script>

<template>
  <NchResponsiveDialog
    :open="isOpen"
    :title="t('preview.label')"
    :description="t('preview.sheet_hint')"
    content-class="sm:max-w-[min(64rem,calc(100vw-2rem))]"
    :should-focus-first="false"
    @update:open="handleOpen"
  >
    <div class="-mx-4 flex h-[70dvh] min-h-0 flex-col overflow-hidden border-t border-border">
      <PreviewPane :key="tab.id" :tab :can-close="isPhone" @close="emit('close')" />
    </div>
  </NchResponsiveDialog>
</template>
