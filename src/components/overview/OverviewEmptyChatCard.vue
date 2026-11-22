<script setup lang="ts">
import { computed } from 'vue'
import { MessageSquare } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchClawdEmpty from '@/components/common/NchClawdEmpty.vue'
import { Button } from '@/components/ui/button'
import type { ChatTabState } from '@/utils/chatTab'
import { folderNameOf } from '@/utils/sessionList'
import { useMachineLabel } from '@/composables/useMachineLabel'

// Figma "39 Übersicht": an open chat without its first prompt, shown as the chat itself shows
// it, so the overview says where a session waits to be started.
const { tab } = defineProps<{ tab: ChatTabState }>()
const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()
const { labelOf: machineLabelOf } = useMachineLabel()

const hint = computed(() =>
  machineLabelOf(tab.machine)
    ? t('chat.clawd_hint', { machine: machineLabelOf(tab.machine), folder: folderNameOf(tab.cwd) })
    : t('chat.clawd_hint_here', { folder: folderNameOf(tab.cwd) })
)
</script>

<template>
  <NchClawdEmpty :title="t('chat.clawd_title')" :hint class="min-h-56">
    <Button
      variant="secondary"
      size="sm"
      class="motion-press touch-manipulation"
      :aria-label="t('overview.open_label', { title: folderNameOf(tab.cwd) })"
      @click="emit('open')"
    >
      <MessageSquare aria-hidden="true" />
      {{ t('overview.open_chat') }}
    </Button>
  </NchClawdEmpty>
</template>
