<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useAutoCompactLeft } from '@/composables/useContextReport'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { useChatStore } from '@/stores/chat'
import { useContextUsageStore } from '@/stores/contextUsage'

// Above the composer once Claude is about to compact on its own (Figma "35"), as the terminal
// counts down "% until auto-compact"; compacting now keeps the moment in the user's hands.
const { tabId } = defineProps<{ tabId: string }>()

const { t } = useI18n()
const format = useUsageFormat()
const store = useContextUsageStore()
const chat = useChatStore()
const left = useAutoCompactLeft(tabId)

// While a turn runs Claude cannot take `/compact`; the hint comes back once it rests.
const isResting = computed(() => {
  const status = chat.tabs.find((tab) => tab.id === tabId)?.status
  return status !== 'working' && status !== 'asking'
})
</script>

<template>
  <div
    v-if="left !== null && isResting"
    class="mb-2 flex items-center gap-2 rounded-lg border border-warning/35 bg-warning/8 px-2.5 py-1.5 text-meta"
  >
    <TriangleAlert class="size-3.5 shrink-0 text-warning" aria-hidden="true" />
    <span class="min-w-0 flex-1">
      {{ t('context.hint_left', { percent: format.usedPercent(left) }) }}
    </span>
    <button
      type="button"
      class="shrink-0 rounded font-medium text-brand underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      @click="store.compact(tabId)"
    >
      {{ t('context.hint_action') }}
    </button>
  </div>
</template>
