<script setup lang="ts">
import { computed } from 'vue'
import { Gauge } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import PanelSection from '@/components/panel/PanelSection.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTabInsights } from '@/composables/useTabInsights'
import { useUsageFormat } from '@/composables/useUsageFormat'
import type { ChatTabState } from '@/utils/chatTab'
import { ALL_PERCENT, percentOf } from '@/utils/percent'
import { contextPartList, contextPercentOf, type ContextPart } from '@/utils/tabInsights'

// How full the context window is, as one bar; the split into cache and new is in its tooltip.
const { tab } = defineProps<{ tab: ChatTabState }>()

const { t } = useI18n()
const format = useUsageFormat()
const { context } = useTabInsights(tab.id)

// One hue in three strengths: the parts of one whole, read left to right.
const PART_CLASS: Record<ContextPart, string> = {
  cached: 'bg-brand',
  written: 'bg-brand/60',
  fresh: 'bg-brand/30'
}

const percent = computed(() => (context.value ? contextPercentOf(context.value) : 0))
const parts = computed(() => {
  const now = context.value
  if (!now) return []
  return contextPartList.map((key) => ({
    key,
    class: PART_CLASS[key],
    tokens: now.split[key],
    width: `${percentOf(now.split[key], now.window)}%`
  }))
})
// No reply yet in this run: still starting or reading the transcript, or nothing said so far.
const isLoading = computed(
  () => !context.value && (tab.status === 'starting' || tab.history === 'loading')
)
</script>

<template>
  <PanelSection :icon="Gauge" :title="t('panel.context')">
    <template v-if="context" #aside>
      <span class="text-meta text-muted-foreground tabular-nums">
        {{
          t('panel.context_of', {
            tokens: format.compact(context.tokens),
            window: format.compact(context.window)
          })
        }}
      </span>
    </template>
    <Tooltip v-if="context">
      <TooltipTrigger as-child>
        <div
          tabindex="0"
          class="flex h-1.5 overflow-hidden rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          role="meter"
          :aria-label="t('panel.context_label', { percent: format.usedPercent(percent) })"
          aria-valuemin="0"
          :aria-valuemax="ALL_PERCENT"
          :aria-valuenow="percent"
        >
          <div
            v-for="part in parts"
            :key="part.key"
            :class="part.class"
            :style="{ width: part.width }"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <ul class="flex flex-col gap-0.5 tabular-nums">
          <li v-for="part in parts" :key="part.key" class="flex items-center gap-1.5">
            <span class="size-1.5 rounded-full" :class="part.class" aria-hidden="true" />
            {{ t(`panel.context_split.${part.key}`) }} {{ format.compact(part.tokens) }}
          </li>
        </ul>
      </TooltipContent>
    </Tooltip>
    <div v-else-if="isLoading" class="flex flex-col gap-2">
      <Skeleton class="h-1.5 w-full rounded-full" />
    </div>
    <p v-else class="text-small text-muted-foreground">{{ t('panel.context_empty') }}</p>
  </PanelSection>
</template>
