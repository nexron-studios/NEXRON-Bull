<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import ChatContextDetails from '@/components/chat/ChatContextDetails.vue'
import { useTabInsights } from '@/composables/useTabInsights'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { useContextUsageStore } from '@/stores/contextUsage'
import { contextLevelOf } from '@/utils/contextUsage'
import { ALL_PERCENT } from '@/utils/percent'
import { METER_LEVEL_CLASS } from '@/utils/quota'
import { contextPercentOf } from '@/utils/tabInsights'

// How full the context is, as a ring next to the send button (Figma "Prompt Input"). A click
// opens what fills it (Figma "35"), the panel no longer repeats it.
const { tabId } = defineProps<{ tabId: string }>()

const RADIUS = 6
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const { t } = useI18n()
const format = useUsageFormat()
const { context } = useTabInsights(tabId)
const store = useContextUsageStore()

const percent = computed(() => (context.value ? contextPercentOf(context.value) : 0))
const dash = computed(() => `${(percent.value / ALL_PERCENT) * CIRCUMFERENCE} ${CIRCUMFERENCE}`)
const strokeClass = computed(() => METER_LEVEL_CLASS[contextLevelOf(percent.value)].stroke)
const isOpen = computed({
  get: () => store.openTabId === tabId,
  set: (isNowOpen) => (isNowOpen ? store.openContext(tabId) : store.closeContext())
})
</script>

<template>
  <Popover v-if="context" v-model:open="isOpen">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-meta text-muted-foreground tabular-nums outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="t('composer.context', { percent: format.usedPercent(percent) })"
      >
        <svg viewBox="0 0 16 16" class="size-4 -rotate-90" aria-hidden="true">
          <circle cx="8" cy="8" :r="RADIUS" fill="none" stroke-width="2" class="stroke-muted" />
          <circle
            cx="8"
            cy="8"
            :r="RADIUS"
            fill="none"
            stroke-width="2"
            stroke-linecap="round"
            :stroke-dasharray="dash"
            :class="strokeClass"
          />
        </svg>
        {{ format.usedPercent(percent) }}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" side="top" class="w-100 gap-0 p-3">
      <ChatContextDetails :tab-id="tabId" />
    </PopoverContent>
  </Popover>
</template>
