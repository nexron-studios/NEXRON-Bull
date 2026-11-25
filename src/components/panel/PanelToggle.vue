<script setup lang="ts">
import { PanelRight } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { INFO_PANEL_TOGGLE_ID } from '@/utils/infoPanel'
import { INFO_PANEL_CHORD } from '@/utils/shortcuts'

// The header button for the info panel right of the chat.
const { isPressed } = defineProps<{ isPressed: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const { t } = useI18n()
const { labelOf, ariaOf } = useShortcutLabels()
</script>

<template>
  <NchIconButton
    :id="INFO_PANEL_TOGGLE_ID"
    :label="t(isPressed ? 'panel.hide' : 'panel.show', { key: labelOf(INFO_PANEL_CHORD) })"
    :aria-pressed="isPressed"
    :aria-keyshortcuts="ariaOf(INFO_PANEL_CHORD)"
    class="shrink-0"
    @click="emit('toggle')"
  >
    <PanelRight class="size-4" aria-hidden="true" />
  </NchIconButton>
</template>
