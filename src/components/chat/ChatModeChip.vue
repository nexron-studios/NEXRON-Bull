<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NchKbd from '@/components/common/NchKbd.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useChatSettingsStore } from '@/stores/chatSettings'
import type { ChatTabState, PermissionMode } from '@/utils/chatTab'
import { modeLookOf } from '@/utils/sessionSettingIcons'
import { modesAfter, nextModeOf } from '@/utils/sessionSettings'

// The mode of a chat; a click or Shift+Tab in the composer moves to the next one, in Claude
// Code's order (Figma "33"). The tooltip says what the mode lets Claude do and what comes next.
const { tab, mode } = defineProps<{ tab: ChatTabState; mode: PermissionMode }>()

const CYCLE_KEY = '⇧Tab'

const { t } = useI18n()
const chatSettings = useChatSettingsStore()

const look = computed(() => modeLookOf(mode))
const refused = computed(() => chatSettings.refusedModesOf(tab.id))
const next = computed(() => nextModeOf(mode, refused.value))
/** "Erst planen → Auto → Nachfragen": every mode after this one, once round */
const cycle = computed(() =>
  modesAfter(mode, refused.value)
    .map((name) => t(`chat.modes.${name}`))
    .join(' → ')
)
const label = computed(() =>
  t('composer.mode_switch_label', {
    mode: t(`chat.modes.${mode}`),
    next: t(`chat.modes.${next.value}`)
  })
)
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <button
        type="button"
        :aria-label="label"
        class="flex h-7 shrink-0 touch-manipulation items-center gap-1.5 rounded-md px-2 text-meta text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        @click="chatSettings.setMode(tab.id, next)"
      >
        <component :is="look.icon" class="size-3.5" :class="look.tone" aria-hidden="true" />
        {{ t(`chat.modes.${mode}`) }}
        <NchKbd :key-label="CYCLE_KEY" />
      </button>
    </TooltipTrigger>
    <TooltipContent class="flex max-w-72 flex-col items-start gap-1">
      <span class="font-medium">{{ t(`chat.modes.${mode}`) }}</span>
      <span class="opacity-80">{{ t(`composer.mode_hints.${mode}`) }}</span>
      <span class="flex items-start gap-1.5 opacity-80">
        <NchKbd :key-label="CYCLE_KEY" class="mt-px border-current text-current" />
        {{ t('composer.mode_next', { cycle }) }}
      </span>
    </TooltipContent>
  </Tooltip>
</template>
