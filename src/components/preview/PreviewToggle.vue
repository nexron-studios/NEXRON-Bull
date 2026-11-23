<script setup lang="ts">
import { AppWindow } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { PREVIEW_TOGGLE_ID, usePreviewStore } from '@/stores/preview'
import { PREVIEW_CHORD } from '@/utils/shortcuts'

// The header button for the preview beside the chat, next to the info panel's.
const { isPressed } = defineProps<{ isPressed: boolean }>()

const { t } = useI18n()
const { labelOf, ariaOf } = useShortcutLabels()
const preview = usePreviewStore()
</script>

<template>
  <NchIconButton
    :id="PREVIEW_TOGGLE_ID"
    :label="t(isPressed ? 'preview.hide' : 'preview.show', { key: labelOf(PREVIEW_CHORD) })"
    :aria-pressed="isPressed"
    :aria-keyshortcuts="ariaOf(PREVIEW_CHORD)"
    class="shrink-0"
    @click="preview.toggle"
  >
    <AppWindow class="size-4" aria-hidden="true" />
  </NchIconButton>
</template>
