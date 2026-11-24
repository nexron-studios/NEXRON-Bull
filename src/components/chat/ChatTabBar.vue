<script setup lang="ts">
import { nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { X } from '@lucide/vue'
import { useResizeObserver } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import ChatMutedMark from '@/components/chat/ChatMutedMark.vue'
import ChatStatusIcon from '@/components/chat/ChatStatusIcon.vue'
import SessionContextMenu from '@/components/session/SessionContextMenu.vue'
import TerminalNewMenu from '@/components/terminal/TerminalNewMenu.vue'
import TerminalTabList from '@/components/terminal/TerminalTabList.vue'
import { useDragOptions } from '@/composables/useDragOptions'
import { useFlipMove } from '@/composables/useFlipMove'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { useChatStore } from '@/stores/chat'
import type { TerminalRequest } from '@/stores/terminalRequests'
import { useTerminalStore } from '@/stores/terminals'
import { openQuestionOf } from '@/utils/answerCallouts'
import { isEmptyChat } from '@/utils/sessionList'
import { shownStatusOf, type ChatTabState } from '@/utils/chatTab'
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
/** Where the underline of the active tab sits, in px from the bar's left edge */
const underline = ref<{ x: number; width: number } | null>(null)

const { t } = useI18n()
const { ariaOf } = useShortcutLabels()
const dragOptions = useDragOptions('x')
const { finishRanks } = storeToRefs(useChatStore())
const { tabs: terminalTabs } = storeToRefs(useTerminalStore())
// A chat that finishes moves to its place in the finish order; the tabs slide there.
const { skipNext: skipNextMove } = useFlipMove(bar, 'data-tab-cell', () =>
  tabs.map((tab) => tab.id).join('|')
)

const handleDrop = (moved: ChatTabState[]) => {
  skipNextMove()
  emit(
    'reorder',
    moved.map((tab) => tab.id)
  )
}
// Any tab that changes width (a title, a status icon, the font arriving) resizes the whole list,
// and only a tab left of the active one can move it.
useResizeObserver(list, () => measureUnderline())

// Ctrl+Shift+Left/Right is the keyboard way of dragging; focus stays on the moved tab.
const handleKeydown = async (event: KeyboardEvent, id: string) => {
  const step = moveStepOf(event)
  if (!step) return
  event.preventDefault()
  emit('move', id, step)
  await nextTick()
  bar.value?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus()
}

const measureUnderline = () => {
  const cell = activeId
    ? bar.value?.querySelector<HTMLElement>(`[data-tab-cell="${activeId}"]`)
    : null
  underline.value = cell ? { x: cell.offsetLeft, width: cell.offsetWidth } : null
}

// After the render that moved, renamed or selected a tab, so the new geometry is measured.
watch(
  () => [
    activeId,
    [...tabs, ...terminalTabs.value].map((tab) => `${tab.id}:${tab.title}`).join('|')
  ],
  measureUnderline,
  {
    flush: 'post',
    immediate: true
  }
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
    <!-- One 1 px line scaled to the tab's width: it slides with transform only (Figma "16 Motion"). -->
    <span
      v-if="underline"
      class="pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left bg-brand transition-transform duration-200 ease-out-soft"
      :style="{ transform: `translateX(${underline.x}px) scaleX(${underline.width})` }"
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
            :rank="finishRanks.get(tab.id) ?? null"
            :is-failed="tab.notice !== null"
            :is-waiting="tab.limit.kind === 'waiting'"
            :has-question="openQuestionOf(tab) !== null"
          />
          <span class="truncate" :class="tab.id === activeId ? 'text-foreground' : 'text-subtle'">
            {{ tab.title || t('chat.new_chat') }}
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
