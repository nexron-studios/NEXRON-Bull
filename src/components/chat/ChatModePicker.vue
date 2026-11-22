<script setup lang="ts">
import { Check } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useChatSettingsStore } from '@/stores/chatSettings'
import { permissionModeList, type ChatTabState, type PermissionMode } from '@/utils/chatTab'
import { modeLookOf } from '@/utils/sessionSettingIcons'

// The four modes as a list, for the phone's "this chat" sheet (Figma "M29"), where there is no
// Shift+Tab to walk them.
const { tab, mode } = defineProps<{ tab: ChatTabState; mode: PermissionMode }>()

const { t } = useI18n()
const chatSettings = useChatSettingsStore()
</script>

<template>
  <div class="flex flex-col gap-1">
    <p class="px-2.5 pt-1.5 text-meta font-medium text-muted-foreground">{{ t('chat.mode') }}</p>
    <div role="group" :aria-label="t('chat.mode')" class="flex flex-col">
      <button
        v-for="name in permissionModeList"
        :key="name"
        type="button"
        :aria-pressed="mode === name"
        class="flex min-h-11 touch-manipulation items-center gap-2.5 rounded-md px-2.5 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted"
        @click="chatSettings.setMode(tab.id, name)"
      >
        <component
          :is="modeLookOf(name).icon"
          class="size-4 shrink-0"
          :class="modeLookOf(name).tone"
          aria-hidden="true"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-small">{{ t(`chat.modes.${name}`) }}</span>
          <span class="text-meta text-muted-foreground">{{
            t(`composer.mode_hints.${name}`)
          }}</span>
        </span>
        <Check v-if="mode === name" class="size-4 shrink-0 text-brand" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
