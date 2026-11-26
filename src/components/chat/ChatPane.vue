<script setup lang="ts">
import { computed, reactive, ref, shallowReactive, watch } from 'vue'
import { ArrowDown, FileWarning, ImageDown, Info, RotateCcw, TriangleAlert } from '@lucide/vue'
import { useEventListener, usePreferredReducedMotion } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import NchClawdEmpty from '@/components/common/NchClawdEmpty.vue'
import NchEmpty from '@/components/common/NchEmpty.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import { Button } from '@/components/ui/button'
import ChatActivitySheet from '@/components/chat/ChatActivitySheet.vue'
import ChatAutoCompactHint from '@/components/chat/ChatAutoCompactHint.vue'
import ChatBackgroundBar from '@/components/chat/ChatBackgroundBar.vue'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatContextDialog from '@/components/chat/ChatContextDialog.vue'
import ChatHistorySkeleton from '@/components/chat/ChatHistorySkeleton.vue'
import ChatLimitNudge from '@/components/chat/ChatLimitNudge.vue'
import ChatLimitWaitingCard from '@/components/chat/ChatLimitWaitingCard.vue'
import ChatLiveBlock from '@/components/chat/ChatLiveBlock.vue'
import ChatOlderHistory from '@/components/chat/ChatOlderHistory.vue'
import ChatPermissionCard from '@/components/chat/ChatPermissionCard.vue'
import ChatPlanCard from '@/components/chat/ChatPlanCard.vue'
import ChatPromptSuggestions from '@/components/chat/ChatPromptSuggestions.vue'
import ChatQuestionCard from '@/components/chat/ChatQuestionCard.vue'
import ChatBackdrop from '@/components/chat/ChatBackdrop.vue'
import ChatRewindDialog from '@/components/chat/ChatRewindDialog.vue'
import ChatRetryCard from '@/components/chat/ChatRetryCard.vue'
import ChatSearch from '@/components/chat/ChatSearch.vue'
import ChatSessionBar from '@/components/chat/ChatSessionBar.vue'
import ChatShellRuns from '@/components/chat/ChatShellRuns.vue'
import ChatStreamItem from '@/components/chat/ChatStreamItem.vue'
import ChatThinkingBar from '@/components/chat/ChatThinkingBar.vue'
import ReviewDialog from '@/components/review/ReviewDialog.vue'
import { useMachineLabel } from '@/composables/useMachineLabel'
import { useChatFollow } from '@/composables/useChatFollow'
import { useChatSearch } from '@/composables/useChatSearch'
import { useDoubleEscape } from '@/composables/useDoubleEscape'
import { provideImageNameScope } from '@/composables/useImageNameScope'
import { provideCalloutTarget } from '@/composables/useCalloutTarget'
import { provideMarkupTarget } from '@/composables/useMarkupTarget'
import { useOlderHistory } from '@/composables/useOlderHistory'
import { useScrollEdges } from '@/composables/useScrollEdges'
import { useSkipOffscreenWidth } from '@/composables/useSkipOffscreenWidth'
import { providePromptEdit, usePromptEditOf } from '@/composables/usePromptEdit'
import { useChatStore } from '@/stores/chat'
import { vSkipOffscreen } from '@/lib/skipOffscreen'
import { useDraftStore } from '@/stores/drafts'
import { useRewindStore } from '@/stores/rewind'
import type { QueuedPromptProps } from '@/types/agentd.type'
import { latestAnswerOf } from '@/utils/answerCallouts'
import type { ChatTabState } from '@/utils/chatTab'
import { buildStream, firstTurnIndexOf } from '@/utils/chatStream'
import type { PendingImage } from '@/utils/content'
import type { Delivery } from '@/utils/pendingPrompts'
import { resultsByToolId } from '@/utils/toolPairs'
import { isAwaitingReply } from '@/utils/activity'
import { approvalIdOf, useRevealTarget } from '@/composables/useChatReveal'
import { approvalKindOf, planOf } from '@/utils/approval'
import { appendedKeys, isAnimatedOnArrival } from '@/utils/motion'
import { folderNameOf } from '@/utils/sessionList'
import { isChatSearchShortcut } from '@/utils/shortcuts'

// `isCompact`: the phone screen. Its own top bar shows machine and account, so the session bar
// goes, and the composer sits on the home indicator's safe area.
const { tab, isCompact = false } = defineProps<{ tab: ChatTabState; isCompact?: boolean }>()
/** A local page's "Preview" button in an answer was clicked; the owner knows where it can show */
const emit = defineEmits<{ preview: [url: string] }>()

const scroller = ref<HTMLElement | null>(null)
const composer = ref<InstanceType<typeof ChatComposer> | null>(null)
const searchBox = ref<InstanceType<typeof ChatSearch> | null>(null)
const isDragging = ref(false)
const isActivityOpen = ref(false)
// Items arriving right now; set once, so a later scroll never restarts the animation, and dropped
// when it ends.
const arrivals = shallowReactive(new Set<string>())

const { t } = useI18n()
const { labelOf: machineLabelOf } = useMachineLabel()
const chat = useChatStore()
const rewind = useRewindStore()
const drafts = useDraftStore()
const { isAtBottom, scrollToBottom, follow, glideToBottom, glideTo, isGliding, onGlideEnd } =
  useChatFollow(scroller)
// The open search floats over the chat's top: a revealed card lands below it.
useRevealTarget(scroller, glideTo, () => searchBox.value?.coverOf() ?? null)
const reducedMotion = usePreferredReducedMotion()
// The session bar (phone: the screen's top bar) casts its edge. The composer deliberately does
// not: a band above it read as a footer and blinked off after every message.
const { hasMoreAbove } = useScrollEdges(scroller)
useSkipOffscreenWidth(scroller)

const isWorking = computed(() => tab.status === 'working' || tab.status === 'asking')
// Every streamed token replaces the tab object, but not its message lists. These computeds return
// the same arrays then, so the history is only regrouped when a message actually arrives.
const known = computed(() => tab.messages)
// Sent prompts show at once, before Claude echoes them.
const pending = computed(() => tab.pending)
const messages = computed(() => [...known.value, ...pending.value])
const results = computed(() => resultsByToolId(messages.value))
const stream = computed(() =>
  buildStream(messages.value, results.value, { outputs: tab.outputs, isRunning: isWorking.value })
)
const search = reactive(useChatSearch(stream, scroller, glideTo))
// From here on the items keep their keys when older messages load: the scroll anchors.
const anchorsFrom = computed(() => {
  const index = firstTurnIndexOf(stream.value)
  return index < 0 ? stream.value.length : index
})
// A prompt sent before Claude started waits in the store; the pane already shows Claude starting.
const isQueued = computed(() => chat.hasQueued(tab.id))
const isWaiting = computed(() => isAwaitingReply(tab) || isQueued.value)
// Nothing said yet: Clawd sleeps until the first prompt. Only for a transcript known to be empty,
// never for one that is still unread or failed to load.
const isEmpty = computed(
  () =>
    tab.history === 'loaded' &&
    !messages.value.length &&
    !tab.hasMore &&
    tab.live.kind === 'none' &&
    !tab.permission &&
    !isWorking.value &&
    !isQueued.value
)
const hasHistoryFailed = computed(() => tab.history === 'failed' && !messages.value.length)
const loadOlder = () => chat.loadHistory(tab.id)
useOlderHistory(
  scroller,
  () => ({ history: tab.history, hasMore: tab.hasMore, count: tab.messages.length }),
  { load: loadOlder, isGliding, onGlideEnd }
)
const emptyHint = computed(() =>
  machineLabelOf(tab.machine)
    ? t('chat.clawd_hint', { machine: machineLabelOf(tab.machine), folder: folderNameOf(tab.cwd) })
    : t('chat.clawd_hint_here', { folder: folderNameOf(tab.cwd) })
)

const approvalKind = computed(() => (tab.permission ? approvalKindOf(tab.permission) : null))
// Leaving plan mode is a permission too; its input is the plan as markdown.
const plan = computed(() => planOf(tab.permission))
// While tabs switch, the leaving pane is still mounted; only the active one answers keys.
const isCurrent = computed(() => chat.activeId === tab.id)

const send = (text: string, images: PendingImage[], delivery: Delivery) =>
  chat.send(tab.id, text, images, delivery)

// A second Ctrl+F while open selects the term again, like a browser's find bar.
const openSearch = () => (search.isOpen ? searchBox.value?.focus() : search.open())
// A click elsewhere keeps the focus it moved; one on plain chat text moves it nowhere, and typing
// then belongs in the composer.
const dismissSearch = () => {
  search.close()
  if (document.activeElement === document.body) composer.value?.focus()
}
const closeSearch = () => {
  search.close()
  composer.value?.focus()
}
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (!isCurrent.value || !isChatSearchShortcut(event)) return
  event.preventDefault()
  openSearch()
})

// Callout buttons only on the answer that ended the last turn, and only until the user wrote again.
const latestAnswerId = computed(() => latestAnswerOf(tab)?.uuid ?? null)

const waiting = computed(() => (tab.limit.kind === 'waiting' ? tab.limit : null))
const warning = computed(() =>
  tab.limit.kind === 'warning' && tab.limit.candidate
    ? { account: tab.limit.account, candidate: tab.limit.candidate }
    : null
)

// Back into the composer to be changed; agentd drops its copy, sending it again queues it anew.
const editQueued = (prompt: QueuedPromptProps) => {
  const draft = drafts.draftOf(tab.id)
  draft.text = draft.text ? `${draft.text}\n${prompt.text}` : prompt.text
  void chat.queueRemove(tab.id, prompt.id)
}

// Claude stays in plan mode and waits; what to change goes in through the composer.
const adjustPlan = () => {
  chat.adjustPlan(tab.id)
  composer.value?.focus()
}

// Esc Esc goes back to an earlier prompt, as in the terminal; while Claude works Esc stops it.
useDoubleEscape(
  () => isCurrent.value && !isWorking.value,
  () => rewind.openRewind(tab.id)
)

// A marked image, from the history or the composer itself, goes into this tab's composer, or out
// as a message of its own.
provideMarkupTarget((result, handoff) => composer.value?.handOver(result, handoff) ?? false)
// The buttons of a callout in an answer: a question goes into the composer, a suggestion is sent.
provideCalloutTarget({
  reply: (question) => composer.value?.quote(question),
  send: (text) => send(text, [], 'afterTurn'),
  isLatestAnswer: (messageId) => latestAnswerId.value === messageId
})
provideImageNameScope(() => ({ tabId: tab.id, machine: tab.machine, sessionId: tab.sessionId }))
// "Bearbeiten" under a sent prompt goes back to before it through the rewind dialog.
providePromptEdit(usePromptEditOf(() => tab))

const handleDrop = (event: DragEvent) => {
  isDragging.value = false
  void composer.value?.addFiles(event.dataTransfer?.files ?? [])
}

// When the item's last arrival animation ends (transitions.css): the rise, which outlasts the
// fade, or under reduced motion the fade alone. Events bubbling up from inside it do not count.
const settleArrival = (event: AnimationEvent, key: string) => {
  const last = reducedMotion.value === 'reduce' ? 'message-fade' : 'message-rise'
  if (event.target === event.currentTarget && event.animationName === last) arrivals.delete(key)
}

// The newest message, not the count: an older page landing above is no reason to follow.
watch(() => [messages.value.at(-1)?.uuid, tab.live, tab.permission] as const, follow)
watch(() => tab.id, scrollToBottom, { immediate: true })
// Before the render that adds them, so they mount already rising.
watch(
  stream,
  (next, previous) => {
    const added = new Set(
      appendedKeys(
        previous.map((item) => item.key),
        next.map((item) => item.key)
      )
    )
    for (const item of next)
      if (added.has(item.key) && isAnimatedOnArrival(item)) arrivals.add(item.key)
  },
  { flush: 'pre' }
)
// The buttons sit in rendered markdown (v-html, markdown.ts): one listener here serves them all.
const handlePreviewClick = (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return
  const url = event.target.closest<HTMLElement>('[data-preview]')?.dataset.preview
  if (url) emit('preview', url)
}
</script>

<template>
  <section
    class="relative isolate flex min-h-0 flex-1 flex-col"
    @click="handlePreviewClick"
    @dragover.prevent="isDragging = true"
    @dragleave.self="isDragging = false"
    @drop.prevent="handleDrop"
  >
    <div
      v-if="isDragging"
      class="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-act-read bg-background/80"
    >
      <span class="flex items-center gap-2 text-title font-semibold">
        <ImageDown class="size-6 text-act-read" aria-hidden="true" />
        {{ t('chat.drop_images') }}
      </span>
    </div>
    <ChatSessionBar v-if="!isCompact" :tab :is-search-open="search.isOpen" @search="openSearch" />
    <!-- The backdrop starts below the session bar (chrome, not part of the chat) and runs under the
         composer, so the vignette ends at the window edge instead of in a line above it. -->
    <div class="relative isolate flex min-h-0 flex-1 flex-col">
      <ChatBackdrop />
      <!-- No overflow-anchor: older pages are anchored by hand (useOlderHistory), as WKWebView
           has no native anchoring; Chromium's on top would move the list a second time.
           The messages fade out over the list's bottom padding instead of ending in a hard cut
           above the composer. Always on, not a band that comes and goes (Jonas, 24.11.2026):
           at rest it lies over empty padding, so only messages scrolled past it fade. -->
      <div
        ref="scroller"
        class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [overflow-anchor:none]"
        :class="isCompact ? 'mask-b-from-[calc(100%-1rem)]' : 'mask-b-from-[calc(100%-1.5rem)]'"
      >
        <!-- data-tab-content: the part that fades in on a tab switch (transitions.css). -->
        <div
          data-tab-content
          class="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-5"
          :class="isCompact ? 'px-4 py-4' : 'px-6 py-6'"
        >
          <template v-if="isEmpty">
            <NchClawdEmpty :title="t('chat.clawd_title')" :hint="emptyHint" />
            <ChatPromptSuggestions @pick="composer?.fill($event)" />
          </template>
          <NchEmpty
            v-else-if="hasHistoryFailed"
            :icon="FileWarning"
            :title="t('chat.history_failed_title')"
            :hint="t('chat.history_failed_hint')"
          >
            <Button variant="outline" @click="chat.loadHistory(tab.id)">
              <RotateCcw class="size-4" aria-hidden="true" />
              {{ t('chat.history_retry') }}
            </Button>
          </NchEmpty>
          <ChatOlderHistory v-if="tab.hasMore" :history="tab.history" @load="loadOlder" />
          <ChatHistorySkeleton v-if="tab.history === 'loading' && !messages.length" />
          <!-- The frame the browser skips off screen (`v-skip-offscreen`). Skipping clips what a
               message draws beyond its box, so the frame gives rings and the tool rule room: its
               padding and negative margin of equal size leave the layout as it was. -->
          <div
            v-for="(item, index) in stream"
            :key="item.key"
            v-skip-offscreen
            class="-mx-2 -my-1 flex flex-col px-2 py-1"
            :class="arrivals.has(item.key) && 'message-rise'"
            :data-search-key="item.key"
            :data-scroll-anchor="index >= anchorsFrom ? item.key : undefined"
            @animationend="settleArrival($event, item.key)"
          >
            <ChatStreamItem :item :results :is-running="isWorking" />
          </div>
          <ChatRetryCard v-if="tab.retry" :retry="tab.retry" class="message-fade" />
          <ChatLiveBlock :tab />
          <ChatShellRuns :tab-id="tab.id" />
          <ChatQuestionCard
            v-if="approvalKind === 'question' && tab.permission"
            :id="approvalIdOf(tab.id)"
            :permission="tab.permission"
            :is-keyed="isCurrent"
            @answer="(answers) => chat.answerQuestion(tab.id, answers)"
            @skip="chat.answer(tab.id, false)"
          />
          <ChatPlanCard
            v-else-if="approvalKind === 'plan' && plan !== null"
            :id="approvalIdOf(tab.id)"
            :plan
            :is-keyed="isCurrent"
            @accept="chat.answer(tab.id, true)"
            @adjust="adjustPlan"
          />
          <ChatPermissionCard
            v-else-if="tab.permission"
            :id="approvalIdOf(tab.id)"
            :permission="tab.permission"
            :is-keyed="isCurrent"
            @answer="(isAllowed, reason) => chat.answer(tab.id, isAllowed, reason)"
            @always="chat.allowAlways(tab.id)"
          />
          <ChatLimitWaitingCard
            v-if="waiting"
            :state="waiting"
            @move="(profile) => chat.limitMove(tab.id, profile, 'continue')"
            @send="chat.queueSend(tab.id)"
            @remove="(entry) => chat.queueRemove(tab.id, entry)"
            @edit="editQueued"
          />
        </div>
      </div>
      <NchScrollEdge edge="top" :is-shown="hasMoreAbove" />
      <ChatSearch
        v-if="search.isOpen"
        ref="searchBox"
        :search
        @close="closeSearch"
        @dismiss="dismissSearch"
      />

      <div
        class="relative mx-auto w-full max-w-4xl"
        :class="isCompact ? 'px-3 pb-safe' : 'px-6 pb-5'"
      >
        <!-- After prompt-kit's Scroll Button (MIT): only there while the reader is scrolled up. -->
        <NchIconButton
          v-if="!isAtBottom"
          :label="t('chat.scroll_down')"
          variant="outline"
          size="icon-sm"
          class="absolute -top-11 left-1/2 -translate-x-1/2 rounded-full bg-card shadow-md"
          @click="glideToBottom"
        >
          <ArrowDown class="size-4" aria-hidden="true" />
        </NchIconButton>
        <p
          v-if="tab.notice"
          class="mb-2 flex items-start gap-2 text-small text-critical"
          role="alert"
        >
          <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {{ tab.notice }}
        </p>
        <p
          v-else-if="tab.status === 'ended'"
          class="mb-2 flex items-center gap-2 text-small text-muted-foreground"
        >
          <Info class="size-4 shrink-0" aria-hidden="true" />
          {{ tab.isWorktreePlanned ? t('worktree.planned_hint') : t('chat.ended_hint') }}
        </p>
        <ChatLimitNudge
          v-if="warning"
          :account="warning.account"
          :candidate="warning.candidate"
          @stay="chat.dismissLimit(tab.id)"
          @move="chat.moveAfterTurn(tab.id, warning.candidate.profile)"
        />
        <ChatAutoCompactHint :tab-id="tab.id" />
        <ChatThinkingBar
          v-if="isWorking || isWaiting"
          :tab
          :results
          :is-starting="isWaiting"
          :has-details="isCompact"
          @interrupt="chat.interrupt(tab.id)"
          @details="isActivityOpen = true"
        />
        <ChatBackgroundBar v-else :tab-id="tab.id" />
        <ChatComposer
          ref="composer"
          :tab
          :is-working
          :is-compact
          @send="send"
          @interrupt="chat.interrupt(tab.id)"
        />
      </div>
    </div>
    <ChatActivitySheet v-if="isCompact" v-model:open="isActivityOpen" :tab />
    <ChatContextDialog v-if="isCompact" :tab-id="tab.id" />
    <ChatRewindDialog :tab-id="tab.id" @rewound="composer?.focus()" />
    <ReviewDialog :tab @insert="composer?.takeReview($event)" />
  </section>
</template>
