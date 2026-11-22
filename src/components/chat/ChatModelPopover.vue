<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BrandClawdMark from '@/components/brand/BrandClawdMark.vue'
import ChatModelPicker from '@/components/chat/ChatModelPicker.vue'
import ChatSettingsSheet from '@/components/chat/ChatSettingsSheet.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsPhone } from '@/composables/useViewport'
import { useChatSettingsStore } from '@/stores/chatSettings'
import type { ChatTabState } from '@/utils/chatTab'
import type { SessionSettings } from '@/utils/sessionSettings'

// The model chip under the composer ("Opus 5.5 · Hoch"): a popover with model and effort above
// it (Figma "33"), on a phone the "this chat" sheet with the mode as well (Figma "M29"). Open
// while the store names this tab, so `/model` opens it too.
const { tab, label } = defineProps<{
  tab: ChatTabState
  settings: SessionSettings
  /** What the chip shows */
  label: string
}>()

const { t } = useI18n()
const isPhone = useIsPhone()
const chatSettings = useChatSettingsStore()

const isOpen = computed({
  get: () => chatSettings.pickerTabId === tab.id,
  set: (isNowOpen) =>
    isNowOpen ? chatSettings.openModelPicker(tab.id) : chatSettings.closeModelPicker()
})
const triggerLabel = computed(() => t('composer.model_switch_label', { current: label }))

// A closed tab leaves no open picker behind for a tab that may come back under its id.
onUnmounted(() => {
  if (isOpen.value) chatSettings.closeModelPicker()
})
</script>

<template>
  <template v-if="isPhone">
    <Button
      variant="ghost"
      size="sm"
      class="h-7 shrink-0 gap-1.5 px-2 text-meta font-normal text-muted-foreground"
      :aria-label="triggerLabel"
      aria-haspopup="dialog"
      @click="isOpen = true"
    >
      <BrandClawdMark :size="9" />
      {{ label }}
      <ChevronDown class="size-3.5" aria-hidden="true" />
    </Button>
    <ChatSettingsSheet v-model:open="isOpen" :tab :settings />
  </template>
  <Popover v-else v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 shrink-0 gap-1.5 px-2 text-meta font-normal text-muted-foreground"
        :aria-label="triggerLabel"
      >
        <BrandClawdMark :size="9" />
        {{ label }}
        <ChevronDown class="size-3.5" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-120 gap-1 p-1.5">
      <ChatModelPicker :tab :settings />
    </PopoverContent>
  </Popover>
</template>
