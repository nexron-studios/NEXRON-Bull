<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { PanelLeftOpen, PanelRight, Plus } from '@lucide/vue'
import { onKeyStroke } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import NchClawdEmpty from '@/components/common/NchClawdEmpty.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchThemeToggle from '@/components/common/NchThemeToggle.vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import ChatNewDialog from '@/components/chat/ChatNewDialog.vue'
import ChatPaneSwitch from '@/components/chat/ChatPaneSwitch.vue'
import ChatNotifyToggle from '@/components/chat/ChatNotifyToggle.vue'
import ChatPhoneScreen from '@/components/chat/ChatPhoneScreen.vue'
import ChatTabBar from '@/components/chat/ChatTabBar.vue'
import NavBottomBar from '@/components/nav/NavBottomBar.vue'
import NavRoutePage from '@/components/nav/NavRoutePage.vue'
import PanelInfo from '@/components/panel/PanelInfo.vue'
import PanelResizeHandle from '@/components/panel/PanelResizeHandle.vue'
import PreviewColumn from '@/components/preview/PreviewColumn.vue'
import PreviewSheet from '@/components/preview/PreviewSheet.vue'
import PreviewToggle from '@/components/preview/PreviewToggle.vue'
import SessionRail from '@/components/session/SessionRail.vue'
import SessionResizeHandle from '@/components/session/SessionResizeHandle.vue'
import SessionConfirmDialog from '@/components/session/SessionConfirmDialog.vue'
import SessionSidebar from '@/components/session/SessionSidebar.vue'
import SettingsLink from '@/components/settings/SettingsLink.vue'
import TerminalDrawer from '@/components/terminal/TerminalDrawer.vue'
import TerminalPhoneScreen from '@/components/terminal/TerminalPhoneScreen.vue'
import TerminalTabPane from '@/components/terminal/TerminalTabPane.vue'
import { useBullSlashCommands } from '@/composables/useBullSlashCommands'
import { useChatNavigation } from '@/composables/useChatNavigation'
import { useFinishTracking } from '@/composables/useFinishTracking'
import { useInfoPanel } from '@/composables/useInfoPanel'
import { useLimitPolicySync } from '@/composables/useLimitPolicySync'
import { usePhoneChatHistory } from '@/composables/usePhoneChatHistory'
import { usePreviewPane } from '@/composables/usePreviewPane'
import { useSidebarLayout } from '@/composables/useSidebarLayout'
import { useTabNotifications } from '@/composables/useTabNotifications'
import { useTerminals } from '@/composables/useTerminals'
import { useIsNarrow, useIsPhone } from '@/composables/useViewport'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { useChatStore } from '@/stores/chat'
import { usePreviewStore } from '@/stores/preview'
import { foregroundShellOf } from '@/utils/activity'
import { useTerminalStore } from '@/stores/terminals'
import {
  INFO_PANEL_CHORD,
  isNewSessionShortcut,
  isNewTerminalShortcut,
  isSidebarShortcut,
  isTerminalDrawerShortcut
} from '@/utils/shortcuts'
import { RAIL_WIDTH } from '@/utils/sidebarLayout'

/** Where the focus goes once Enter on the panel's edge shut the panel */
const INFO_PANEL_TOGGLE_ID = 'info-panel-toggle'

const isNewOpen = ref(false)
const isDrawerOpen = ref(false)
const hasSearchOnOpen = ref(false)

const { t } = useI18n()
const { labelOf, ariaOf } = useShortcutLabels()
const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const { tabs, activeId, activeTab } = storeToRefs(chat)
const terminals = useTerminalStore()
const { activeTabId: shownTerminalId, activeTab: shownTerminal } = storeToRefs(terminals)
const isNarrow = useIsNarrow()
const isPhone = useIsPhone()
const {
  layout,
  savedLayout,
  size,
  panelWidth,
  windowWidth,
  preview,
  resize,
  toggleRail,
  showPanel
} = useSidebarLayout()
useTabNotifications()
usePhoneChatHistory()
useLimitPolicySync()
useBullSlashCommands()
const { isChatRoute, shownChatId, openChat } = useChatNavigation()
const { here, openHere, toggleDrawer } = useTerminals()

const isChatShown = computed(() => isNarrow.value || layout.value !== 'full')
// The drawer covers the chat on a narrow window: what finishes under it is not seen.
useFinishTracking(() => (isChatShown.value && !isDrawerOpen.value ? shownChatId.value : null))
const sidebarWidth = () => (layout.value === 'rail' ? RAIL_WIDTH : panelWidth.value)
const previewStore = usePreviewStore()
// Beside the chat, between it and the info panel; the drawer of a narrow window takes no room.
const previewPane = usePreviewPane(
  windowWidth,
  () => (isNarrow.value ? 0 : sidebarWidth()),
  () => isChatRoute.value && !!activeTab.value && !shownTerminal.value && isChatShown.value
)
const infoPanel = useInfoPanel(
  windowWidth,
  () => sidebarWidth() + previewPane.takenWidth.value,
  () =>
    isChatRoute.value &&
    !!activeTab.value &&
    !shownTerminal.value &&
    isChatShown.value &&
    !isPhone.value
)
const asideWidth = computed(() => {
  if (layout.value === 'rail') return `${RAIL_WIDTH}px`
  return layout.value === 'panel' ? `${panelWidth.value}px` : undefined
})

// A new session is a chat: from another page the dialog opens over the chat it will start.
const openNew = () => {
  isDrawerOpen.value = false
  isNewOpen.value = true
  if (!isChatRoute.value) void router.push({ name: 'chat' })
}
const toggleSidebar = () => {
  // A phone has no sidebar to toggle: the list is its home screen.
  if (isPhone.value) return
  if (isNarrow.value) isDrawerOpen.value = !isDrawerOpen.value
  else toggleRail()
}
// The chat comes back as soon as a session is picked from the full-width overview, the drawer
// or while another page is shown.
const handleOpened = () => {
  isDrawerOpen.value = false
  // Also for the chat that was already active behind a terminal tab.
  shownTerminalId.value = null
  // The drawer leaves the saved desktop layout alone.
  if (!isNarrow.value && layout.value === 'full') showPanel()
  if (!isChatRoute.value) void router.push({ name: 'chat' })
}
// On a phone no open chat means the list; closing a chat goes back there, not to another tab.
const closeOnPhone = (id: string) => {
  chat.close(id)
  activeId.value = null
}
// Also when that tab was already the shown one behind another page.
const showTerminal = (id: string) => {
  shownTerminalId.value = id
  if (!isChatRoute.value) void router.push({ name: 'chat' })
}
// Enter on the panel's edge shut it: the focus goes to the button that brings it back.
// Focus moves once the panel is gone, so the toggle is announced as no longer pressed.
const closeInfoPanelFromEdge = async () => {
  await infoPanel.resize({ isOpen: false })
  await nextTick()
  document.getElementById(INFO_PANEL_TOGGLE_ID)?.focus()
}
const searchFromRail = async () => {
  hasSearchOnOpen.value = true
  showPanel()
  await nextTick()
  hasSearchOnOpen.value = false
}

onKeyStroke(isNewSessionShortcut, (event) => {
  event.preventDefault()
  openNew()
})
// Ctrl+B is Claude Code's key for "run this shell in the background"; while a shell runs in the
// chat on screen it does that, otherwise it folds the sidebar as before.
onKeyStroke(isSidebarShortcut, (event) => {
  event.preventDefault()
  const tab = isChatRoute.value && !shownTerminal.value ? chat.activeTab : null
  const shell = tab ? foregroundShellOf(tab) : null
  if (tab && shell) return void chat.sendToBackground(tab.id, shell.id)
  toggleSidebar()
})
// The drawer belongs to the chat on screen; on a phone there is no room under the chat.
onKeyStroke(isTerminalDrawerShortcut, (event) => {
  event.preventDefault()
  if (isPhone.value || !isChatRoute.value || shownTerminal.value) return
  toggleDrawer()
})
onKeyStroke(isNewTerminalShortcut, (event) => {
  event.preventDefault()
  openHere()
})

// Claude on another machine outlives the app; restored tabs pick up where it is now.
chat.reattachAll()

// Resumed tabs and tabs restored after a restart carry no messages yet; load them when shown.
// Only ended tabs: a session that just started has no transcript to read.
watch(
  activeId,
  () => {
    const tab = activeTab.value
    if (tab?.sessionId && tab.status === 'ended' && !tab.messages.length)
      void chat.loadHistory(tab.id)
  },
  { immediate: true }
)
watch([isNarrow, isPhone], () => {
  isDrawerOpen.value = false
})
// A page needs the content column: picked in the drawer or the full-width sidebar, opened on start
// or by a link while the saved layout is full width.
watch(
  [() => route.name, isNarrow],
  () => {
    isDrawerOpen.value = false
    if (!isChatRoute.value && !isNarrow.value && layout.value === 'full') showPanel()
  },
  { immediate: true }
)
// A terminal tab takes the chat's place: opened from another page (the settings' login, a tab
// clicked there), the chat page comes back to show it.
watch(shownTerminalId, (id) => {
  if (id && !isChatRoute.value) void router.push({ name: 'chat' })
})
// Widening the sidebar to full width on a page asks for the sessions overview it then shows.
watch(savedLayout, (next) => {
  if (next === 'full' && !isChatRoute.value) void router.push({ name: 'chat' })
})
// "No chat open" is the phone's list, and it is saved with the tabs. Wider, the tab bar is back and
// one of its tabs is shown, as after closing a tab there: also when the app starts wide.
watch(
  isPhone,
  (isNowPhone) => {
    if (!isNowPhone && !activeId.value) activeId.value = tabs.value.at(-1)?.id ?? null
  },
  { immediate: true }
)
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <!-- Phone: the list is home and a chat is pushed over it. The list stays mounted underneath
         (hidden, inert), so search and scroll position are still there on the way back. -->
    <!-- Pages below, the bottom bar under them; an open chat covers both (Figma "M01", "M14"). -->
    <div v-if="isPhone" class="relative flex min-w-0 flex-1 flex-col">
      <SessionSidebar
        v-show="isChatRoute"
        is-phone
        class="min-h-0 min-w-0 flex-1 pt-safe px-safe"
        :class="{ invisible: activeTab }"
        :inert="!!activeTab"
        data-route-content
        @new="openNew"
      />
      <NavRoutePage v-if="!isChatRoute" class="pt-safe px-safe" edge="bottom" @new="openNew" />
      <NavBottomBar :inert="!!activeTab && isChatRoute" />
      <Transition
        enter-active-class="transition-[transform,opacity] duration-200 ease-out-soft"
        enter-from-class="translate-x-6 opacity-0"
      >
        <ChatPhoneScreen
          v-if="activeTab && isChatRoute"
          :tab="activeTab"
          class="absolute inset-0 bg-background"
          @back="activeId = null"
          @close="closeOnPhone(activeTab.id)"
        />
      </Transition>
      <Transition
        enter-active-class="transition-[transform,opacity] duration-200 ease-out-soft"
        enter-from-class="translate-x-6 opacity-0"
      >
        <TerminalPhoneScreen
          v-if="shownTerminal"
          :key="shownTerminal.id"
          :entry="shownTerminal"
          class="absolute inset-0 z-10 bg-background"
          @back="shownTerminalId = null"
        />
      </Transition>
    </div>
    <aside
      v-else-if="!isNarrow"
      class="relative flex shrink-0 flex-col"
      :class="layout === 'full' ? 'flex-1' : 'border-r border-border'"
      :style="{ width: asideWidth }"
      :aria-label="t('sidebar.label')"
      data-snap-sidebar
    >
      <SessionRail
        v-if="layout === 'rail'"
        @new="openNew"
        @search="searchFromRail"
        @expand="showPanel"
      />
      <SessionSidebar
        v-else
        :is-wide="layout === 'full'"
        :has-search-on-open
        @new="openNew"
        @hide="toggleRail"
        @opened="handleOpened"
      />
      <SessionResizeHandle
        :size
        :window-width
        @preview="preview"
        @resize="resize"
        @toggle="toggleRail"
      />
    </aside>
    <Sheet v-else v-model:open="isDrawerOpen">
      <SheetContent
        side="left"
        :show-close-button="false"
        class="gap-0 bg-background p-0 data-[side=left]:w-80 data-[side=left]:max-w-[85vw]"
      >
        <SheetTitle class="sr-only">{{ t('sidebar.label') }}</SheetTitle>
        <SheetDescription class="sr-only">{{ t('sidebar.description') }}</SheetDescription>
        <SessionSidebar @new="openNew" @hide="isDrawerOpen = false" @opened="handleOpened" />
      </SheetContent>
    </Sheet>

    <div v-if="isChatShown && !isPhone" class="flex min-w-0 flex-1 flex-col" data-snap-chat>
      <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <NchIconButton
          v-if="isNarrow"
          :label="t('sidebar.show')"
          size="icon-sm"
          class="shrink-0"
          @click="isDrawerOpen = true"
        >
          <PanelLeftOpen class="size-4" aria-hidden="true" />
        </NchIconButton>
        <ChatTabBar
          :tabs
          :active-id="(isChatRoute && shownTerminalId) || shownChatId"
          :here
          @select="openChat"
          @select-terminal="showTerminal"
          @close="chat.close"
          @new="openNew"
          @reorder="chat.reorder"
          @move="chat.moveTab"
        />
        <NchThemeToggle class="shrink-0" />
        <ChatNotifyToggle />
        <SettingsLink class="shrink-0" />
        <PreviewToggle
          v-if="isChatRoute && activeTab && !shownTerminal"
          :is-pressed="previewPane.isShown.value || previewStore.isSheetOpen"
        />
        <NchIconButton
          v-if="infoPanel.canShow.value"
          :id="INFO_PANEL_TOGGLE_ID"
          :label="
            t(infoPanel.isOpen.value ? 'panel.hide' : 'panel.show', {
              key: labelOf(INFO_PANEL_CHORD)
            })
          "
          :aria-pressed="infoPanel.isOpen.value"
          :aria-keyshortcuts="ariaOf(INFO_PANEL_CHORD)"
          class="shrink-0"
          @click="infoPanel.toggle"
        >
          <PanelRight class="size-4" aria-hidden="true" />
        </NchIconButton>
      </header>

      <div class="flex min-h-0 flex-1">
        <NavRoutePage v-if="!isChatRoute" edge="top" @new="openNew" />
        <TerminalTabPane v-else-if="shownTerminal" :entry="shownTerminal" />
        <div v-else-if="activeTab" class="flex min-w-0 flex-1 flex-col" data-snap-chat-pane>
          <ChatPaneSwitch :tab="activeTab" :tabs class="min-w-0" />
          <TerminalDrawer :key="activeTab.id" :chat-id="activeTab.id" :here />
        </div>
        <main v-else class="flex min-h-0 flex-1 flex-col p-6">
          <NchClawdEmpty :title="t('chat.empty_title')" :hint="t('chat.empty_hint')">
            <Button @click="openNew">
              <Plus class="size-4" aria-hidden="true" />
              {{ t('chat.new_chat') }}
            </Button>
          </NchClawdEmpty>
        </main>
        <PreviewColumn
          v-if="activeTab && previewPane.isShown.value"
          :tab="activeTab"
          :pane="previewPane"
        />
        <div
          v-if="isChatRoute && activeTab && !shownTerminal && infoPanel.isShown.value"
          class="relative flex min-h-0 shrink-0"
          :style="{ width: `${infoPanel.width.value}px` }"
          data-snap-panel
        >
          <PanelInfo
            :key="activeTab.id"
            :tab="activeTab"
            class="transition-opacity duration-150"
            :class="{ 'opacity-40': infoPanel.isClosing.value }"
          />
          <PanelResizeHandle
            :width="infoPanel.width.value"
            :max-width="infoPanel.maxWidth.value"
            :is-closing="infoPanel.isClosing.value"
            @preview="infoPanel.preview"
            @resize="infoPanel.resize"
            @reset="infoPanel.resetWidth"
            @close="closeInfoPanelFromEdge"
          />
        </div>
      </div>
    </div>

    <ChatNewDialog v-model:open="isNewOpen" />
    <PreviewSheet v-if="activeTab" :tab="activeTab" />
    <SessionConfirmDialog />
  </div>
</template>
