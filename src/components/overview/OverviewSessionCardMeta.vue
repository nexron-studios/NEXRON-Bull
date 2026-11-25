<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import ChatFinishBadge from '@/components/chat/ChatFinishBadge.vue'
import { useAgeFormat } from '@/composables/useAgeFormat'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { useChatStore } from '@/stores/chat'
import { isBusyStatus, type ChatTabState } from '@/utils/chatTab'
import { runningSinceOf, shownStatusOf } from '@/utils/shownStatus'

// The card's one info line, as in the Agent Dashboard: when it finished (with its finish number)
// or how long it runs, then how many prompts. It never wraps, or a tick from "59 s" to "1 min"
// would reflow it and make the whole card jump.
const { tab, now, promptCount } = defineProps<{
  tab: ChatTabState
  now: number
  /** `null` while the tab holds only part of its transcript */
  promptCount: number | null
}>()

const { t } = useI18n()
const formatAge = useAgeFormat()
const format = useUsageFormat()
const { finishRanks } = storeToRefs(useChatStore())

const rank = computed(() => finishRanks.value.get(tab.id) ?? null)
// A chat a background agent holds runs on, though Claude's own turn is over.
const finishedAt = computed(() => (isBusyStatus(shownStatusOf(tab)) ? null : tab.finishedAt))
const runningSince = computed(() => runningSinceOf(tab))
const ageOf = (since: number) => formatAge.value(Math.max(0, now - since))
</script>

<template>
  <p
    class="flex h-5 min-w-0 items-center gap-x-2 overflow-hidden text-small whitespace-nowrap text-muted-foreground"
  >
    <template v-if="finishedAt !== null">
      <span class="flex shrink-0 items-center gap-1.5 font-semibold text-good">
        <ChatFinishBadge v-if="rank" :rank />
        {{ t('overview.card.finished_at', { time: format.time(finishedAt) }) }}
      </span>
      <span class="tabular-nums">{{ t('overview.card.ago', { age: ageOf(finishedAt) }) }}</span>
    </template>
    <span v-else-if="runningSince !== null" class="tabular-nums">
      {{ t('sidebar.age_running', { age: ageOf(runningSince) }) }}
    </span>
    <template v-if="promptCount !== null">
      <span v-if="finishedAt !== null || runningSince !== null" aria-hidden="true">·</span>
      <span class="truncate">{{ t('overview.card.prompts', promptCount) }}</span>
    </template>
  </p>
</template>
