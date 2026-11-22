<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, Square } from '@lucide/vue'
import { useEventListener, useIntervalFn, useNow } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import ChatEffortBadge from '@/components/chat/ChatEffortBadge.vue'
import { Button } from '@/components/ui/button'
import { useQuip } from '@/composables/useQuip'
import { useSessionSettings } from '@/composables/useSessionSettings'
import { activityOfTab } from '@/utils/activity'
import { turnMessagesOf, type ChatTabState } from '@/utils/chatTab'
import { formatElapsed } from '@/utils/elapsed'
import { shouldStopOnEscape } from '@/utils/escape'
import { LONG_TURN_MS, quipMoodOf } from '@/utils/quips'
import type { ToolResultBlock } from '@/utils/toolPairs'
import { liveTurnTokensOf, tokenCountFormatterOf } from '@/utils/turnStats'

// What Claude is doing right now, above the composer, after prompt-kit's Thinking Bar (MIT).
// The brand-blue wave and the shimmer loop while the turn runs (Figma "37" A) and stop with it.
// `hasDetails`: on a phone the label opens the activity sheet (Figma "M21"); there is no panel.
// `isStarting`: sent, but Claude has not reacted yet. The bar stands from the moment of sending
// (20.11.2026), so the stop button is there before the first token.
const {
  tab,
  results,
  hasDetails = false,
  isStarting = false
} = defineProps<{
  tab: ChatTabState
  results: Map<string, ToolResultBlock>
  hasDetails?: boolean
  isStarting?: boolean
}>()
const emit = defineEmits<{ interrupt: []; details: [] }>()

const TICK_MS = 1000
// The wave's resting shape, also what stays when the system asks for less motion.
const WAVE_HEIGHTS_PX = [6, 11, 15, 9]
const WAVE_STEP_MS = 120

const { t, locale } = useI18n()
const { settings } = useSessionSettings(() => tab)
// A stopwatch needs one tick per second, not one per frame.
const now = useNow({ scheduler: (tick) => useIntervalFn(tick, TICK_MS) })

const activity = computed(() => activityOfTab(tab, results))
const runningMs = computed(() => (tab.turn ? now.value.getTime() - tab.turn.startedAt : 0))
const { quip } = useQuip(
  // Starting reads as thinking, with the same guards: no joke over a retry or a limit wait.
  () => quipMoodOf(tab, isStarting ? { kind: 'thinking' } : activity.value),
  () => runningMs.value >= LONG_TURN_MS,
  now
)

// The plain sentence is the main text ("Claude is running npm test"); the quip only trails it.
const activityText = () => {
  const current = activity.value
  if (current.kind !== 'tool') return t(`chat.stream.activity.${current.kind}`)
  if (!current.target && current.activity !== 'delegates' && current.activity !== 'plans')
    return t('chat.stream.activity.uses', { tool: current.tool })
  return t(`chat.stream.activity.${current.activity}`, {
    target: current.target,
    tool: current.tool
  })
}
const label = computed(() => (isStarting ? t('chat.stream.awaiting_reply') : activityText()))
// Before Claude reacts the sheet would be empty, so the label stays plain text until then.
const opensSheet = computed(() => hasDetails && !isStarting)
const elapsed = computed(() => (tab.turn ? formatElapsed(runningMs.value) : ''))
const formatTokens = computed(() => tokenCountFormatterOf(locale.value))
// What the turn has written so far, like the terminal's "↓ 4.2k tokens".
const tokens = computed(() => {
  const count = liveTurnTokensOf(turnMessagesOf(tab), tab.outputs, tab.streamUsage.chars)
  return count ? formatTokens.value(count) : ''
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  // A prompt waiting for Claude to start can be stopped too, as the bar's button says.
  if (shouldStopOnEscape(event, isStarting ? 'working' : tab.status)) emit('interrupt')
})
</script>

<template>
  <div
    class="mb-2 flex items-center gap-3 rounded-xl border border-border bg-card py-1.5 pr-1.5 pl-4"
  >
    <span class="flex h-4 shrink-0 items-end gap-0.5" aria-hidden="true">
      <span
        v-for="(height, index) in WAVE_HEIGHTS_PX"
        :key="index"
        class="w-[3px] wave-bar rounded-full bg-brand"
        :style="{ height: `${height}px`, animationDelay: `${index * WAVE_STEP_MS}ms` }"
      />
    </span>
    <!-- As a button its name stays put; the label still reaches screen readers from outside it. -->
    <component
      :is="opensSheet ? 'button' : 'p'"
      :type="opensSheet ? 'button' : undefined"
      :aria-haspopup="opensSheet ? 'dialog' : undefined"
      :aria-label="opensSheet ? t('activity.sheet_open') : undefined"
      class="flex min-w-0 flex-1 touch-manipulation items-baseline gap-1.5 rounded-sm text-left text-small outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :class="{ 'motion-press': opensSheet }"
      @click="opensSheet && emit('details')"
    >
      <span v-if="!opensSheet" class="sr-only" aria-live="polite">{{ label }}</span>
      <span class="min-w-0 text-shimmer truncate font-medium" aria-hidden="true">{{ label }}</span>
      <!-- Flavour only: small, muted, and the first to give way when space runs out. Screen readers
           never get it, it changes every few seconds. -->
      <span
        v-if="quip"
        class="flex min-w-0 shrink-[999] gap-1.5 truncate text-meta text-muted-foreground"
        aria-hidden="true"
      >
        <span>·</span>
        <Transition name="quip" mode="out-in">
          <span :key="quip" class="inline-block min-w-0 truncate">{{ quip }}</span>
        </Transition>
      </span>
      <span v-if="elapsed" class="shrink-0 text-meta text-muted-foreground tabular-nums">
        <span aria-hidden="true">·</span>
        <span class="sr-only">{{ t('chat.stream.elapsed') }}</span>
        {{ elapsed }}
      </span>
      <span
        v-if="tokens"
        class="flex shrink-0 items-center gap-0.5 text-meta text-muted-foreground tabular-nums"
      >
        <span aria-hidden="true">·</span>
        <ArrowDown class="size-3" aria-hidden="true" />
        <span class="sr-only">{{ t('chat.stream.tokens_label') }}</span>
        {{ t('chat.stream.tokens', { n: tokens }) }}
      </span>
      <!-- A phone has no Esc key, and its composer chip right below names the effort already:
           both would only take the room the quip needs. -->
      <ChatEffortBadge
        v-if="settings.effort && !hasDetails"
        :effort="settings.effort"
        class="self-center"
      />
    </component>
    <span v-if="opensSheet" class="sr-only" aria-live="polite">{{ label }}</span>
    <Button
      variant="ghost"
      size="sm"
      class="motion-press shrink-0 text-subtle"
      @click="emit('interrupt')"
    >
      <Square class="size-3.5 fill-current" aria-hidden="true" />
      {{ t('chat.stream.stop') }}
      <kbd
        v-if="!hasDetails"
        class="rounded border border-border px-1 font-sans text-meta text-muted-foreground"
        aria-hidden="true"
        >{{ t('chat.stream.stop_key') }}</kbd
      >
    </Button>
  </div>
</template>
