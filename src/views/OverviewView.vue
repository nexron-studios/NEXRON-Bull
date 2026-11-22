<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { Plus, Radio, RefreshCw } from '@lucide/vue'
import { useElementSize, useIntervalFn, useNow } from '@vueuse/core'
import { useRouteQuery } from '@vueuse/router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import NchClawdEmpty from '@/components/common/NchClawdEmpty.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Button } from '@/components/ui/button'
import OverviewActivitySection from '@/components/overview/OverviewActivitySection.vue'
import OverviewDoneSection from '@/components/overview/OverviewDoneSection.vue'
import OverviewEmptyChatCard from '@/components/overview/OverviewEmptyChatCard.vue'
import OverviewSessionCard from '@/components/overview/OverviewSessionCard.vue'
import OverviewSessionCardGhost from '@/components/overview/OverviewSessionCardGhost.vue'
import { useHasOtherMachines } from '@/composables/useAgentdCatalog'
import { useAllRecentSessions } from '@/composables/useAllRecentSessions'
import { useChatNavigation } from '@/composables/useChatNavigation'
import { useIsPhone } from '@/composables/useViewport'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { NEW_SESSION_CHORD } from '@/utils/shortcuts'
import { useChatStore } from '@/stores/chat'
import { useSessionActionsStore } from '@/stores/sessionActions'
import {
  DEFAULT_DONE_RANGE,
  doneSessionsOf,
  ghostCountOf,
  gridColumnsOf,
  parseDoneRange,
  rankedDoneOf,
  type DoneRange,
  type DoneSession,
  type RankedDone
} from '@/utils/overview'
import { isBusyStatus, listedTabOf, type ChatTabState } from '@/utils/chatTab'
import { targetOfDone } from '@/utils/sessionActions'
import { groupRows, isEmptyChat, sessionRowsOf, waitsForAnswer } from '@/utils/sessionList'

// Figma "12 Übersicht" and "M14": every session on every machine, what runs and what is done.
// `new` asks the shell for a new session; the dialog lives there.
const emit = defineEmits<{ new: [] }>()

/** Elapsed times are whole minutes; a tick every few seconds keeps them close enough. */
const CLOCK_MS = 15 * 1000

const page = useTemplateRef<HTMLElement>('page')
const runningSection = useTemplateRef('runningSection')

const { t } = useI18n()
const hasOtherMachines = useHasOtherMachines()
const { labelOf } = useShortcutLabels()
const isPhone = useIsPhone()
const { tabs, finishRanks } = storeToRefs(useChatStore())
const actions = useSessionActionsStore()
const { openChat, resumeChat } = useChatNavigation()
const range = useRouteQuery<string, DoneRange>('done', DEFAULT_DONE_RANGE, {
  transform: { get: parseDoneRange, set: String }
})
const now = useNow({ scheduler: (tick) => useIntervalFn(tick, CLOCK_MS) })
const {
  perMachine,
  isPending: isDonePending,
  isError: isDoneError,
  isFetching: isDoneFetching,
  failedMachines,
  loadingMachines,
  refetch: refetchDone
} = useAllRecentSessions()
// Columns follow the section's width, not the window: the sidebar takes its share. The section
// stays mounted while the grid comes and goes, so a first card already gets the right columns.
const { width: runningWidth } = useElementSize(runningSection)

// A chat whose answer ends on a question needs the user too, as in the sidebar. A new chat still
// starting has its own Clawd card below.
const isBusyListed = (tab: ChatTabState) => {
  const listed = listedTabOf(tab)
  return (
    !isEmptyChat(listed) &&
    (isBusyStatus(listed.status) || waitsForAnswer(listed, now.value.getTime()))
  )
}
const busyTabs = computed(() => tabs.value.filter(isBusyListed))
// The sidebar's order: approvals first, then the longest running.
const running = computed(() =>
  groupRows(sessionRowsOf(busyTabs.value, [], now.value.getTime())).flatMap((entry) =>
    entry.rows.map((row) => row.tab)
  )
)
// Open chats without a first prompt sit beside the running ones, as Clawd waiting (Figma "39").
const emptyTabs = computed(() => tabs.value.filter(isEmptyChat))
const columns = computed(() => gridColumnsOf(runningWidth.value))
const ghostCount = computed(() =>
  ghostCountOf(running.value.length + emptyTabs.value.length, columns.value)
)
// A chat waiting for an answer has its card above; it is not done yet.
const waitingIds = computed(
  () => new Set(busyTabs.value.filter((tab) => !isBusyStatus(tab.status)).map((tab) => tab.id))
)
const allDone = computed(() =>
  doneSessionsOf(perMachine.value, tabs.value).filter(
    (done) => done.source.kind !== 'tab' || !waitingIds.value.has(done.source.tabId)
  )
)
const done = computed(() =>
  rankedDoneOf(allDone.value, finishRanks.value, range.value, now.value.getTime())
)
const refresh = () => void refetchDone()
const retryDone = () => void refetchDone()
const removeAllDone = (entries: RankedDone[]) =>
  actions.removeAll(entries.flatMap((entry) => targetOfDone(entry, tabs.value) ?? []))
const resume = ({ source, machine }: DoneSession) => {
  if (source.kind === 'tab') openChat(source.tabId)
  else resumeChat(source.session, machine)
}
</script>

<template>
  <main ref="page" class="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
    <!-- A dashboard fills the width (layout.md); the page is a container, so its sections pick
         their columns from the room the sidebar leaves, not from the window. -->
    <div
      class="@container flex min-h-full shrink-0 flex-col gap-5 px-4 py-4 sm:gap-6 sm:px-10 sm:py-8"
    >
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 class="text-title font-semibold sm:text-display">{{ t('overview.title') }}</h1>
          <p class="hidden text-small text-muted-foreground sm:block">
            {{ hasOtherMachines ? t('overview.subtitle') : t('overview.subtitle_single') }}
          </p>
        </div>
        <!-- No count chips beside it since Fassung 6: the section headers count themselves. -->
        <NchIconButton
          :label="t('overview.refresh')"
          :disabled="isDoneFetching"
          class="motion-press"
          @click="refresh"
        >
          <RefreshCw :class="{ 'animate-spin': isDoneFetching }" aria-hidden="true" />
        </NchIconButton>
      </header>

      <section ref="runningSection" class="flex flex-col gap-3" aria-labelledby="overview-running">
        <div class="flex items-center gap-2">
          <Radio class="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 id="overview-running" class="text-body font-semibold">
            {{ t('overview.running') }}
          </h2>
          <span class="rounded-full bg-muted px-1.5 text-meta text-muted-foreground tabular-nums">{{
            running.length
          }}</span>
        </div>
        <div
          v-if="running.length || emptyTabs.length"
          class="grid gap-4"
          :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
        >
          <OverviewSessionCard
            v-for="(tab, index) in running"
            :key="tab.id"
            class="motion-stagger"
            :style="{ '--stagger-index': index }"
            :tab
            :now="now.getTime()"
            @open="openChat(tab.id)"
          />
          <OverviewEmptyChatCard
            v-for="(tab, index) in emptyTabs"
            :key="tab.id"
            class="motion-stagger"
            :style="{ '--stagger-index': running.length + index }"
            :tab
            @open="openChat(tab.id)"
          />
          <OverviewSessionCardGhost v-for="place in ghostCount" :key="`ghost-${place}`" />
        </div>
        <NchClawdEmpty
          v-else
          :title="t('overview.running_empty_title')"
          :hint="
            isPhone
              ? t('overview.running_empty_hint_phone')
              : t('overview.running_empty_hint', { key: labelOf(NEW_SESSION_CHORD) })
          "
          class="min-h-56 flex-none"
        >
          <Button class="motion-press touch-manipulation" @click="emit('new')">
            <Plus class="size-4" aria-hidden="true" />
            {{ t('sidebar.new_session') }}
          </Button>
        </NchClawdEmpty>
      </section>

      <OverviewActivitySection />

      <OverviewDoneSection
        v-model:range="range"
        :done
        :now="now.getTime()"
        :is-pending="isDonePending"
        :is-error="isDoneError"
        :failed-machines="failedMachines"
        :has-loading-machines="loadingMachines.length > 0"
        :scroller="page"
        @resume="resume"
        @remove-all="removeAllDone"
        @retry="retryDone"
        @new="emit('new')"
      />
    </div>
  </main>
</template>
