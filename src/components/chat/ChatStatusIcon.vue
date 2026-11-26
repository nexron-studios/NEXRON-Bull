<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CirclePause,
  LoaderCircle,
  MessageCircleQuestion,
  Timer,
  TriangleAlert
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BrandClawdMark from '@/components/brand/BrandClawdMark.vue'
import ChatFinishBadge from '@/components/chat/ChatFinishBadge.vue'
import type { TabStatus } from '@/utils/chatTab'

// `rank`: a finished chat not seen yet shows its place in the finish order instead of the check;
// with `isSeen` the tab bar shows it for a chat already opened, in a quieter look, and
// `isNewestUnseen` says which of its numbers gets the status colour.
// `isFailed`: the last turn ended with an error; a ready chat then shows a warning, not the check.
// `isWaiting`: the account is full and the chat waits for its reset; that outranks the rest.
// `hasQuestion`: the last answer ends on a question (`> [!question]`); it outranks the finish number.
// `isEmpty`: nobody wrote in the chat yet; Clawd waits instead of a spinner while Claude starts.
// `isStill`: a busy chat shows its icon without turning, where a line beside it already says what
// Claude does (a sidebar row): one turning spinner per running chat cost every frame a repaint.
const {
  status,
  rank = null,
  isSeen = false,
  isNewestUnseen = null,
  isFailed = false,
  isWaiting = false,
  hasQuestion = false,
  isEmpty = false,
  isStill = false
} = defineProps<{
  status: TabStatus
  rank?: number | null
  isSeen?: boolean
  isNewestUnseen?: boolean | null
  isFailed?: boolean
  isWaiting?: boolean
  hasQuestion?: boolean
  isEmpty?: boolean
  isStill?: boolean
}>()

const { t } = useI18n()

// Colour follows the token hierarchy: critical only for an approval, warning for work, good for ready.
interface Look {
  icon: Component
  class: string
  isSpinning?: boolean
}
const LOOK: Record<TabStatus, Look> = {
  starting: { icon: CircleDashed, class: 'text-muted-foreground', isSpinning: true },
  idle: { icon: CircleCheck, class: 'text-good' },
  working: { icon: LoaderCircle, class: 'text-warning', isSpinning: true },
  asking: { icon: CircleAlert, class: 'text-critical' },
  ended: { icon: CirclePause, class: 'text-muted-foreground' }
}

const FAILED_LOOK: Look = { icon: TriangleAlert, class: 'text-warning' }
const WAITING_LOOK: Look = { icon: Timer, class: 'text-act-read' }
const QUESTION_LOOK: Look = { icon: MessageCircleQuestion, class: 'text-warning' }

const isFailedIdle = computed(() => isFailed && status === 'idle')
const look = computed(() => {
  if (isWaiting) return WAITING_LOOK
  if (hasQuestion) return QUESTION_LOOK
  return isFailedIdle.value ? FAILED_LOOK : LOOK[status]
})
const isSpinning = computed(() => !!look.value.isSpinning && !isStill)
const label = computed(() => {
  if (isWaiting) return t('chat.status.waiting')
  if (hasQuestion) return t('chat.status.question')
  return t(isFailedIdle.value ? 'chat.status.failed' : `chat.status.${status}`)
})
</script>

<template>
  <!-- The box of the other icons, so a title beside it does not shift when the state changes. -->
  <span v-if="isEmpty && !isWaiting" class="flex size-4 shrink-0 items-center justify-center">
    <BrandClawdMark :size="9" />
    <span class="sr-only">{{ t('chat.status.empty') }}</span>
  </span>
  <ChatFinishBadge
    v-else-if="rank !== null && !isWaiting && !hasQuestion"
    :rank
    :is-seen
    :is-newest-unseen
  />
  <template v-else>
    <component
      :is="look.icon"
      class="size-4 shrink-0"
      :class="[look.class, { 'animate-spin': isSpinning }]"
      aria-hidden="true"
    />
    <span class="sr-only">{{ label }}</span>
  </template>
</template>
