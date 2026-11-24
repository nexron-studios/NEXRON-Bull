<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTabInsights } from '@/composables/useTabInsights'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { contextLevelOf } from '@/utils/contextUsage'
import { METER_LEVEL_CLASS } from '@/utils/quota'
import { contextPercentOf } from '@/utils/tabInsights'
import { modelLabelOf, tokenCountFormatterOf } from '@/utils/turnStats'

// Model of the last answer and how full its context is, as a bar over the card's full width so
// it is equally long in every card (Agent Dashboard). Same colour steps as the composer's ring.
// Before Claude's first answer there is no context to measure: only the model picked for the tab,
// on a row of the same height, so the card does not grow once the answer arrives.
const { tabId, model } = defineProps<{
  tabId: string
  /** The tab's model alias (`opus`); `null` keeps the profile's default */
  model: string | null
}>()

const { t, locale } = useI18n()
const format = useUsageFormat()
const { context } = useTabInsights(tabId)

const formatTokens = computed(() => tokenCountFormatterOf(locale.value))
const percent = computed(() => (context.value ? contextPercentOf(context.value) : 0))
const fillClass = computed(() => METER_LEVEL_CLASS[contextLevelOf(percent.value)].fill)
</script>

<template>
  <div class="mt-2 flex h-5 items-center gap-2.5 text-small text-muted-foreground">
    <span v-if="!context && model">{{ t(`chat.models.${model}`) }}</span>
    <template v-if="context">
      <span class="shrink-0">{{ modelLabelOf(context.model) }}</span>
      <span class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-input" aria-hidden="true">
        <span
          class="block h-full rounded-full"
          :class="fillClass"
          :style="{ width: `${percent}%` }"
        />
      </span>
      <span class="shrink-0 tabular-nums" aria-hidden="true">{{
        formatTokens(context.tokens)
      }}</span>
      <span class="sr-only">
        {{
          t('overview.card.context', {
            tokens: format.exact(context.tokens),
            window: format.exact(context.window)
          })
        }}
      </span>
    </template>
  </div>
</template>
