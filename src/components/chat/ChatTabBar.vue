<script setup lang="ts">
import { nextTick, onMounted, useTemplateRef, watch } from 'vue'
import { X } from '@lucide/vue'
import { useResizeObserver } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import ChatMutedMark from '@/components/chat/ChatMutedMark.vue'
import ChatStatusIcon from '@/components/chat/ChatStatusIcon.vue'
import ChatTitleText from '@/components/chat/ChatTitleText.vue'
import SessionContextMenu from '@/components/session/SessionContextMenu.vue'
import TerminalNewMenu from '@/components/terminal/TerminalNewMenu.vue'
import TerminalTabList from '@/components/terminal/TerminalTabList.vue'
import { useDragOptions } from '@/composables/useDragOptions'
import { useFlipMove } from '@/composables/useFlipMove'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { useSlidingMarker } from '@/composables/useSlidingMarker'
import { useChatStore } from '@/stores/chat'
import type { TerminalRequest } from '@/stores/terminalRequests'
import { useTerminalStore } from '@/stores/terminals'
import { openQuestionOf } from '@/utils/answerCallouts'
import { isEmptyChat } from '@/utils/sessionList'
import type { ChatTabState } from '@/utils/chatTab'
import { shownStatusOf } from '@/utils/shownStatus'
import { targetOfTab } from '@/utils/sessionActions'
import { nearestScrollOf } from '@/utils/nearestScroll'
import { MOVE_CHORD, moveStepOf } from '@/utils/shortcuts'

// `activeId` is the chat or terminal tab on screen; `here` is where "Terminal here" opens.
const { tabs, activeId, here } = defineProps<{
  tabs: ChatTabState[]
  activeId: string | null
  here: TerminalRequest
}>()
const emit = defineEmits<{
  select: [id: string]
  selectTerminal: [id: string]
  close: [id: string]
  new: []
  reorder: [ids: string[]]
  move: [id: string, step: -1 | 1]
}>()

const bar = useTemplateRef<HTMLElement>('bar')
const list = useTemplateRef('list')
const line = useTemplateRef<HTMLElement>('line')

const { t } = useI18n()
const { ariaOf } = useShortcutLabels()
const dragOptions = useDragOptions('x')
const { finishRanks, tabFinishRanks } = storeToRefs(useChatStore())
const { tabs: terminalTabs } = storeToRefs(useTerminalStore())
const tabOrder = () => tabs.map((tab) => tab.id).join('|')
const activeCell = () =>
  activeId ? (bar.value?.querySelector<HTMLElement>(`[data-tab-cell="${activeId}"]`) ?? null) : null
// A chat that finishes moves to its place in the finish order; the tabs slide there.
const { skipNext: skipNextMove } = useFlipMove(bar, 'data-tab-cell', tabOrder)
// The underline glides to a newly selected tab and along with the active tab when the order
// changes, on the same spring as the tabs.
const {
  box: underline,
  measure: measureUnderline,
  skipNext: skipNextUnderline
} = useSlidingMarker(bar, line, () => `${activeId}|${tabOrder()}`, activeCell)

const handleDrop = (moved: ChatTabState[]) => {
  skipNextMove()
  skipNextUnderline()
  emit(
    'reorder',
    moved.map((tab) => tab.id)
  )
}
// The sliding marker observes the active tab itself (terminal tabs sit outside `list`). A chat tab
// left of it that changes width moves it without resizing it, but resizes the whole list.
useResizeObserver(list, measureUnderline)

// Ctrl+Shift+Left/Right is the keyboard way of dragging; focus stays on the moved tab.
const handleKeydown = async (event: KeyboardEvent, id: string) => {
  const step = moveStepOf(event)
  if (!step) return
  event.preventDefault()
  emit('move', id, step)
  await nextTick()
  bar.value?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus()
}

// After the render that renamed, opened or closed a tab, so the new geometry is measured.
watch(
  () => [...tabs, ...terminalTabs.value].map((tab) => `${tab.id}:${tab.title}`).join('|'),
  measureUnderline,
  { flush: 'post' }
)

// A tab selected out of sight (a new terminal at the end, a chat picked in the sidebar) scrolls
// into view. Only the bar moves: `scrollIntoView` also scrolled the clipped header around it.
watch(
  () => activeId,
  (id) => {
    const el = bar.value
    const cell = id ? el?.querySelector<HTMLElement>(`[data-tab-cell="${id}"]`) : null
    if (!el || !cell) return
    const item = cell.getBoundingClientRect()
    const viewStart = el.getBoundingClientRect().left + el.clientLeft
    el.scrollLeft = nearestScrollOf(
      { itemStart: item.left, itemEnd: item.right, viewStart, viewEnd: viewStart + el.clientWidth },
      el.scrollLeft
    )
  },
  { flush: 'post' }
)

// Geist loads after the first paint; the tabs are measured again in their real width.
onMounted(() => void document.fonts.ready.then(measureUnderline))
</script>

<template>
  <nav
    ref="bar"
    class="relative flex min-w-0 flex-1 scrollbar-none items-center gap-1 self-stretch overflow-x-auto"
    :aria-label="t('global.app_name')"
  >
    <!-- Drawn in the tab's own width; only the glide scales it (Figma "16 Motion"). A 1 px line
         scaled to the width also scaled its pixel rounding under the UI zoom and fell short. -->
    <span
      ref="line"
      class="pointer-events-none absolute bottom-0 left-0 h-0.5 origin-left bg-brand"
      :class="{ invisible: !underline }"
      :style="
        underline
          ? { width: `${underline.width}px`, transform: `translateX(${underline.x}px)` }
          : undefined
      "
      aria-hidden="true"
    />
    <VueDraggable
      ref="list"
      :model-value="tabs"
      class="flex shrink-0 items-center gap-1"
      v-bind="dragOptions"
      @update:model-value="handleDrop"
    >
      <!-- Right click: mute the chat, and what its "…" offers. -->
      <SessionContextMenu
        v-for="tab in tabs"
        :key="tab.id"
        :target="targetOfTab(tab)"
        as="div"
        :data-tab-cell="tab.id"
        class="group flex max-w-60 min-w-0 shrink-0 items-center rounded-lg border"
        :class="
          tab.id === activeId ? 'border-border bg-card' : 'border-transparent hover:bg-muted/60'
        "
      >
        <button
          type="button"
          class="flex min-w-0 items-center gap-2 py-1.5 pr-1 pl-3 text-small"
          :data-tab-id="tab.id"
          :aria-current="tab.id === activeId ? 'page' : undefined"
          :aria-keyshortcuts="ariaOf(MOVE_CHORD)"
          @click="emit('select', tab.id)"
          @keydown="handleKeydown($event, tab.id)"
        >
          <ChatStatusIcon
            :status="shownStatusOf(tab)"
            :is-empty="isEmptyChat(tab)"
            :rank="tabFinishRanks.get(tab.id) ?? null"
            :is-seen="!finishRanks.has(tab.id)"
            :is-newest-unseen="finishRanks.get(tab.id) === 1"
            :is-failed="tab.notice !== null"
            :is-waiting="tab.limit.kind === 'waiting'"
            :has-question="openQuestionOf(tab) !== null"
          />
          <span class="truncate" :class="tab.id === activeId ? 'text-foreground' : 'text-subtle'">
            <ChatTitleText :title="tab.title || t('chat.new_chat')" :messages="tab.messages" />
          </span>
          <ChatMutedMark v-if="tab.isMuted" />
        </button>
        <NchIconButton
          :label="t('chat.close_tab')"
          size="icon-xs"
          class="mr-1"
          data-no-drag
          @click="emit('close', tab.id)"
        >
          <X aria-hidden="true" />
        </NchIconButton>
      </SessionContextMenu>
    </VueDraggable>
    <TerminalTabList :active-id @select="emit('selectTerminal', $event)" />
    <TerminalNewMenu :here @new-chat="emit('new')" />
  </nav>
</template>
