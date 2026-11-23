<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import { useIsPhone } from '@/composables/useViewport'
import { usePreviewStore } from '@/stores/preview'
import type { ChatTabState } from '@/utils/chatTab'

// The preview where the chat leaves it no column (a phone, a small window): a bottom sheet on a
// phone, a large dialog wider than that (NchResponsiveDialog). It opens without focusing the
// address field, so a phone keeps its keyboard down; only the phone sheet lacks a close button.
defineProps<{ tab: ChatTabState }>()

const { t } = useI18n()
const isPhone = useIsPhone()
const { isSheetOpen } = storeToRefs(usePreviewStore())
</script>

<template>
  <NchResponsiveDialog
    v-model:open="isSheetOpen"
    :title="t('preview.label')"
    :description="t('preview.sheet_hint')"
    content-class="sm:max-w-[min(64rem,calc(100vw-2rem))]"
    :focuses-first="false"
  >
    <div class="-mx-4 flex h-[70dvh] min-h-0 flex-col overflow-hidden border-t border-border">
      <PreviewPane :key="tab.id" :tab :can-close="isPhone" @close="isSheetOpen = false" />
    </div>
  </NchResponsiveDialog>
</template>
