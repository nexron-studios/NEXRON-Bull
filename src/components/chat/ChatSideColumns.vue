<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ChatSideColumn from '@/components/chat/ChatSideColumn.vue'
import PanelInfo from '@/components/panel/PanelInfo.vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import type { SideColumn } from '@/composables/useChatColumns'
import { PREVIEW_TOGGLE_ID } from '@/stores/preview'
import type { ChatTabState } from '@/utils/chatTab'
import { INFO_PANEL_TOGGLE_ID } from '@/utils/infoPanel'

// The columns right of the shown chat: its page preview, then the info panel (useChatColumns).
defineProps<{ tab: ChatTabState; panel: SideColumn; preview: SideColumn }>()

const { t } = useI18n()
</script>

<template>
  <ChatSideColumn
    v-if="preview.layout.value.isShown"
    v-slot="{ isClosing, close }"
    :column="preview"
    :label="t('preview.resize')"
    :toggle-id="PREVIEW_TOGGLE_ID"
    class="border-l border-border"
    data-snap-preview
  >
    <PreviewPane
      :key="tab.id"
      :tab
      class="transition-opacity duration-150"
      :class="{ 'opacity-40': isClosing }"
      @close="close"
    />
  </ChatSideColumn>
  <ChatSideColumn
    v-if="panel.layout.value.isShown"
    v-slot="{ isClosing }"
    :column="panel"
    :label="t('panel.resize')"
    :toggle-id="INFO_PANEL_TOGGLE_ID"
    data-snap-panel
  >
    <PanelInfo
      :key="tab.id"
      :tab
      class="transition-opacity duration-150"
      :class="{ 'opacity-40': isClosing }"
    />
  </ChatSideColumn>
</template>
