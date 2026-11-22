<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatEffortSteps from '@/components/chat/ChatEffortSteps.vue'
import { useModelNames } from '@/composables/useSessionSettings'
import { effortLookOf } from '@/utils/sessionSettingIcons'
import { isEffort, type Effort } from '@/utils/sessionSettings'

// How hard Claude thinks in this turn, as a badge in the thinking bar (Figma "37" A). A level
// newer than Bull's list keeps the neutral look of "medium" and its own name.
const { effort } = defineProps<{ effort: string }>()

const { t } = useI18n()
const { effortNameOf } = useModelNames()

const level = computed<Effort>(() => (isEffort(effort) ? effort : 'medium'))
const look = computed(() => effortLookOf(level.value))
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pr-2 pl-[7px] text-meta font-medium"
    :class="look.badge"
  >
    <ChatEffortSteps :effort="level" :on="look.on" :off="look.off" />
    <span class="sr-only">{{ t('composer.effort') }}:</span>
    <span :class="look.text">{{ effortNameOf(effort) }}</span>
  </span>
</template>
