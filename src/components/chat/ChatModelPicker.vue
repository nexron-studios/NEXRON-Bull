<script setup lang="ts">
import { computed } from 'vue'
import { Circle, CircleDot } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BrandClawdMark from '@/components/brand/BrandClawdMark.vue'
import ChatEffortSteps from '@/components/chat/ChatEffortSteps.vue'
import NchRangeSwitch from '@/components/common/NchRangeSwitch.vue'
import { useModelNames } from '@/composables/useSessionSettings'
import { useIsPhone } from '@/composables/useViewport'
import { useChatSettingsStore } from '@/stores/chatSettings'
import { modelList, type ChatTabState } from '@/utils/chatTab'
import { effortList, isEffort, type Effort, type SessionSettings } from '@/utils/sessionSettings'
import { modelFamilyOf } from '@/utils/tabInsights'

// Model and effort of a running chat (Figma "33", "M29"): the popover above the model chip and
// the phone's "this chat" sheet. Each change goes to Claude at once.
const { tab, settings } = defineProps<{ tab: ChatTabState; settings: SessionSettings }>()

const { t } = useI18n()
const { modelNameOf } = useModelNames()
const chatSettings = useChatSettingsStore()
const isPhone = useIsPhone()

const currentFamily = computed(() => (settings.model ? modelFamilyOf(settings.model) : null))
const effortOptions = computed(() =>
  effortList.map((value) => ({ value, label: t(`composer.efforts.${value}`) }))
)
// Nothing pressed while the chat runs on an effort the composer does not offer (or none known).
const effort = computed<Effort | ''>({
  get: () => (settings.effort && isEffort(settings.effort) ? settings.effort : ''),
  set: (value) => {
    if (value) void chatSettings.setEffort(tab.id, value)
  }
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <p class="px-2.5 pt-1.5 text-meta font-medium text-muted-foreground">
      {{ t('chat.model') }}
    </p>
    <div role="group" :aria-label="t('chat.model')" class="flex flex-col">
      <button
        v-for="name in modelList"
        :key="name"
        type="button"
        :aria-pressed="currentFamily === name"
        class="flex min-h-9 touch-manipulation items-center gap-2.5 rounded-md px-2.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted"
        @click="chatSettings.setModel(tab.id, name)"
      >
        <CircleDot v-if="currentFamily === name" class="size-3.5 text-brand" aria-hidden="true" />
        <Circle v-else class="size-3.5 text-muted-foreground" aria-hidden="true" />
        <BrandClawdMark :size="9" />
        <span class="w-20 shrink-0 text-small font-medium">{{
          currentFamily === name && settings.model ? modelNameOf(settings.model) : modelNameOf(name)
        }}</span>
        <span class="min-w-0 truncate text-meta text-muted-foreground">
          {{ t(`composer.model_hints.${name}`) }}
        </span>
      </button>
    </div>
    <p class="px-2.5 pt-2 text-meta font-medium text-muted-foreground">
      {{ t('composer.effort') }}
    </p>
    <NchRangeSwitch v-model="effort" :options="effortOptions" :label="t('composer.effort')" is-full>
      <template #option="{ option }">
        <span class="flex items-center justify-center gap-1">
          <!-- Five labels with bars need about 72 px each; a phone sheet gives them 45 to 65. -->
          <ChatEffortSteps v-if="option.value && !isPhone" :effort="option.value" />
          {{ option.label }}
        </span>
      </template>
    </NchRangeSwitch>
    <p class="px-2.5 pt-1.5 pb-1 text-meta text-muted-foreground">
      {{ t('composer.applies_next') }}
    </p>
  </div>
</template>
