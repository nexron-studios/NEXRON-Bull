<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowRight,
  CircleAlert,
  Clock,
  Folder,
  LoaderCircle,
  MessageCircleQuestion,
  Monitor
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import OverviewStatusPill from '@/components/overview/OverviewStatusPill.vue'
import { useActivityLabel } from '@/composables/useActivityLabel'
import { useAgeFormat } from '@/composables/useAgeFormat'
import { useMachineLabel } from '@/composables/useMachineLabel'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { openQuestionOf } from '@/utils/answerCallouts'
import { isBusyStatus, type ChatTabState } from '@/utils/chatTab'
import { modelFamilyOf } from '@/utils/overview'
import { folderNameOf, rowActivityOf } from '@/utils/sessionList'
import { contextOf } from '@/utils/tabInsights'
import { TOOL_ICON, TOOL_KIND_CLASS } from '@/utils/toolIcons'
import { toolInfoOf } from '@/utils/toolKind'

// A running session in the overview (Figma "12 Übersicht", "M14"): what it is, where it runs,
// what it does right now, and the way into its chat.
const { tab, now } = defineProps<{ tab: ChatTabState; now: number }>()
const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()
const { labelOf: machineLabelOf } = useMachineLabel()
const formatAge = useAgeFormat()
const format = useUsageFormat()
const activityLabel = useActivityLabel()

// Busy tabs get a card, and finished ones whose answer ends on a question; a tab that just ended
// keeps the work label until the list drops it.
const hasQuestion = computed(() => !isBusyStatus(tab.status) && openQuestionOf(tab) !== null)
const status = computed(() => {
  if (hasQuestion.value) return 'question'
  return tab.status === 'asking' || tab.status === 'starting' ? tab.status : 'working'
})
const title = computed(() => tab.title || t('chat.new_chat'))
const elapsed = computed(() =>
  tab.turn ? formatAge.value(Math.max(0, now - tab.turn.startedAt)) : ''
)
const activity = computed(() => rowActivityOf(tab))
const activityIcon = computed(() => {
  const current = activity.value
  // Whatever waits for approval is the reason the card is red.
  if (tab.permission) return { icon: CircleAlert, class: 'text-critical' }
  if (hasQuestion.value) return { icon: MessageCircleQuestion, class: 'text-warning' }
  if (!current || current.kind !== 'tool') return { icon: LoaderCircle, class: 'text-warning' }
  const info = toolInfoOf(current.tool)
  return { icon: TOOL_ICON[info.icon], class: TOOL_KIND_CLASS[info.kind] }
})
const context = computed(() => contextOf(tab.messages, tab.contextWindow))
const model = computed(() => {
  if (context.value) return t(`usage.models.${modelFamilyOf(context.value.model)}`)
  return tab.model ? t(`chat.models.${tab.model}`) : ''
})
</script>

<template>
  <article
    class="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4"
    :class="{
      'border-critical/50': tab.status === 'asking',
      'border-warning/50': hasQuestion,
      'border-border': tab.status !== 'asking' && !hasQuestion
    }"
  >
    <div class="flex items-center gap-2">
      <OverviewStatusPill :status />
      <span
        v-if="elapsed"
        class="ml-auto flex items-center gap-1 text-meta text-muted-foreground tabular-nums"
      >
        <Clock class="size-3.5" aria-hidden="true" />
        <span aria-hidden="true">{{ elapsed }}</span>
        <span class="sr-only">{{ t('sidebar.age_running', { age: elapsed }) }}</span>
      </span>
    </div>
    <h3 class="truncate text-body font-semibold">{{ title }}</h3>
    <p class="flex min-w-0 items-center gap-1.5 text-small text-muted-foreground">
      <template v-if="machineLabelOf(tab.machine)">
        <Monitor class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ machineLabelOf(tab.machine) }}</span>
        <span aria-hidden="true">·</span>
      </template>
      <Folder class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{{ folderNameOf(tab.cwd) }}</span>
    </p>
    <p
      class="flex min-h-9 min-w-0 items-center gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-meta"
    >
      <component
        :is="activityIcon.icon"
        class="size-3.5 shrink-0"
        :class="activityIcon.class"
        aria-hidden="true"
      />
      <span class="min-w-0 truncate">{{
        activity ? activityLabel(activity) : t('chat.stream.activity.working')
      }}</span>
    </p>
    <div class="mt-auto flex min-w-0 items-center gap-2 text-small text-muted-foreground">
      <span v-if="model" class="truncate">{{ model }}</span>
      <template v-if="context">
        <span aria-hidden="true">·</span>
        <span class="tabular-nums">{{
          t('overview.context_tokens', { tokens: format.compact(context.tokens) })
        }}</span>
      </template>
      <Button
        variant="ghost"
        size="sm"
        class="motion-press -mr-2 ml-auto shrink-0 touch-manipulation"
        :aria-label="t('overview.open_label', { title })"
        @click="emit('open')"
      >
        {{ t('overview.open') }}
        <ArrowRight class="size-4" aria-hidden="true" />
      </Button>
    </div>
  </article>
</template>
