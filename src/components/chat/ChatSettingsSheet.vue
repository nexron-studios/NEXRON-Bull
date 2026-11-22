<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import ChatModelPicker from '@/components/chat/ChatModelPicker.vue'
import ChatModePicker from '@/components/chat/ChatModePicker.vue'
import type { ChatTabState } from '@/utils/chatTab'
import type { SessionSettings } from '@/utils/sessionSettings'

// "This chat" on a phone (Figma "M29"): model, effort and mode in one sheet, from the chat's "…"
// menu or its model chip.
defineProps<{ tab: ChatTabState; settings: SessionSettings }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
</script>

<template>
  <NchResponsiveDialog
    v-model:open="open"
    :title="t('composer.settings_title')"
    :description="t('composer.settings_hint')"
  >
    <div class="flex flex-col gap-3 pb-2">
      <ChatModelPicker :tab :settings />
      <ChatModePicker :tab :mode="settings.mode" class="border-t border-border pt-2" />
    </div>
  </NchResponsiveDialog>
</template>
