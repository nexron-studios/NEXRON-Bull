<script setup lang="ts">
import { computed, type Component } from 'vue'
import { LoaderCircle, MessageCircleQuestion, Sparkles } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useActivityLabel } from '@/composables/useActivityLabel'
import type { ChatTabState } from '@/utils/chatTab'
import { cardStepOf } from '@/utils/sessionCard'
import { TOOL_ICON, TOOL_KIND_CLASS } from '@/utils/toolIcons'
import { toolInfoOf } from '@/utils/toolKind'

// The card's last line, as in the Agent Dashboard: the tool Claude runs (red while it waits for
// approval), or "Claude: …" with the start of its answer. One line, always there, so the card
// keeps its height when the step changes.
const { tab } = defineProps<{ tab: ChatTabState }>()

const { t } = useI18n()
const activityLabel = useActivityLabel()

const step = computed(() => cardStepOf(tab))
const icon = computed((): { icon: Component; class: string } => {
  const current = step.value
  if (current.kind !== 'activity') return { icon: Sparkles, class: 'text-muted-foreground' }
  const { activity, isApproval } = current
  if (activity.kind === 'ask') return { icon: MessageCircleQuestion, class: 'text-warning' }
  if (activity.kind === 'state') return { icon: LoaderCircle, class: 'text-warning' }
  const info = toolInfoOf(activity.tool, activity.target)
  return {
    icon: TOOL_ICON[info.icon],
    class: isApproval ? 'text-critical' : TOOL_KIND_CLASS[info.kind]
  }
})
</script>

<template>
  <div class="flex h-5 min-w-0 items-center gap-2.5 text-small text-subtle">
    <template v-if="step.kind !== 'none'">
      <component :is="icon.icon" class="size-4 shrink-0" :class="icon.class" aria-hidden="true" />
      <p class="min-w-0 flex-1 truncate">
        <template v-if="step.kind === 'reply'">
          <span class="font-medium text-foreground">{{ t('overview.card.claude') }}</span>
          {{ step.text }}
        </template>
        <template v-else-if="step.activity.kind === 'tool'">
          <span v-if="step.isApproval" class="mr-1 font-semibold text-critical">
            {{ t('overview.card.asks_for') }}
          </span>
          <span class="mr-1.5 font-mono text-meta text-foreground">{{ step.activity.tool }}</span>{{
            step.activity.target
          }}
        </template>
        <template v-else>{{ activityLabel(step.activity) }}</template>
      </p>
    </template>
  </div>
</template>
