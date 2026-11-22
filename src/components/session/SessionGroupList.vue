<script setup lang="ts">
import { computed, useTemplateRef, watch, type Component } from 'vue'
import {
  Coffee,
  Inbox,
  MessageSquareDashed,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SearchX,
  ServerOff
} from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import NchClawdEmpty from '@/components/common/NchClawdEmpty.vue'
import NchEmpty from '@/components/common/NchEmpty.vue'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import NchSectionEmpty from '@/components/common/NchSectionEmpty.vue'
import { Button } from '@/components/ui/button'
import SessionGroupHeader from '@/components/session/SessionGroupHeader.vue'
import SessionListSkeleton from '@/components/session/SessionListSkeleton.vue'
import SessionRow from '@/components/session/SessionRow.vue'
import type { Machine } from '@/api/services/agentd.service'
import { useDragOptions } from '@/composables/useDragOptions'
import { useRenderBatches } from '@/composables/useRenderBatches'
import { useScrollEdges } from '@/composables/useScrollEdges'
import { useStaggerEntrance } from '@/composables/useStaggerEntrance'
import { useStuckSection } from '@/composables/useStuckSection'
import { useIsPhone } from '@/composables/useViewport'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { NEW_SESSION_CHORD } from '@/utils/shortcuts'
import { useChatStore } from '@/stores/chat'
import { useSessionActionsStore } from '@/stores/sessionActions'
import { flatIndexOf, sliceGroups } from '@/utils/renderBatch'
import { targetOfTab } from '@/utils/sessionActions'
import {
  isAlwaysShownGroup,
  isSortableGroup,
  type AlwaysShownGroup,
  type SessionGroup,
  type SessionGroupEntry,
  type SessionRow as SessionRowItem
} from '@/utils/sessionList'

const {
  groups,
  query,
  activeId,
  now,
  hasRows,
  isPending,
  isError,
  isRanked,
  machine,
  machineLabel,
  isWide = false
} = defineProps<{
  groups: SessionGroupEntry[]
  query: string
  activeId: string | null
  now: number
  /** The machine has sessions at all, before the search narrows them */
  hasRows: boolean
  isPending: boolean
  isError: boolean
  /** Search hits in ranked order: no dragging */
  isRanked: boolean
  machine: Machine
  machineLabel: string
  isWide?: boolean
}>()
const emit = defineEmits<{
  open: [row: SessionRowItem]
  resetSearch: []
  retry: []
  new: []
  reorder: [keys: string[]]
}>()

const { t } = useI18n()
const { labelOf } = useShortcutLabels()
const scroller = useTemplateRef<HTMLElement>('scroller')
const groupList = useTemplateRef<HTMLElement>('groupList')
const { isEntering, enter } = useStaggerEntrance(scroller)
const dragOptions = useDragOptions('y')
const isPhone = useIsPhone()
const actions = useSessionActionsStore()
const { finishRanks } = storeToRefs(useChatStore())
const { y, hasMoreBelow } = useScrollEdges(scroller)
// The heading stuck to the top casts the edge over the rows beneath it, so the shadow leaves with
// it when the next group pushes it out.
const stuckGroup = useStuckSection(groupList, y)
const totalRows = computed(() => groups.reduce((sum, entry) => sum + entry.rows.length, 0))
// The records are all loaded; only their rows come in batches while the list scrolls. The open
// chat is always rendered: its row carries the highlight and must be reachable by Tab.
const { limit, isAllShown } = useRenderBatches(
  scroller,
  totalRows,
  () => flatIndexOf(groups, (row) => row.tab.id === activeId),
  () => [query, machine]
)

// The section empty state in place of the rows of a group that stays when empty. Play is Bull's
// "start" icon; the rows' own status icons and the chat's "open" circle stay out of it.
const EMPTY_ICON: Record<AlwaysShownGroup, Component> = {
  needs: Coffee,
  running: Play,
  done: Inbox
}

// A phone has no keyboard shortcut; its hint points at the + in the header instead, like the
// list's own empty hints. The key label is the one the "Neue Session" button shows.
const emptyHintOf = (group: AlwaysShownGroup) =>
  isPhone.value && group === 'running'
    ? t('sidebar.group_empty.running.hint_phone')
    : t(`sidebar.group_empty.${group}.hint`, { key: labelOf(NEW_SESSION_CHORD) })
// On a phone the list is the whole screen; its whole-list empty states get the large tile.
const emptySize = computed(() => (isPhone.value ? 'md' : 'sm'))
// A whole-list state waits until the list it replaces has mostly faded (100 ms), otherwise both
// texts overlap for a moment. 80 + 200 ms stays inside the 300 ms ceiling.
const EMPTY_ENTER = 'motion-stagger [animation-delay:80ms]'
const shownGroups = computed(() => sliceGroups(groups, limit.value))

/**
 * Per group, its rows whose chat finished and was not seen yet. Mostly "done", but a turn that
 * ended before midnight or a tab restored after a restart sits in "earlier".
 */
const unseenCounts = computed(
  () =>
    new Map(
      groups.map((entry) => [
        entry.group,
        entry.rows.filter((row) => finishRanks.value.has(row.tab.id)).length
      ])
    )
)

const FINISHED_GROUPS: readonly SessionGroup[] = ['done', 'earlier']

// Seen rows step back only beside a numbered one (Figma `.agent.seen`): the dimming tells new from
// seen. With nothing new, a whole group at 72 % would only look disabled. The open chat never does.
const isSeenRow = (group: SessionGroup, row: SessionRowItem) =>
  FINISHED_GROUPS.includes(group) &&
  !!unseenCounts.value.get(group) &&
  !(finishRanks.value.has(row.tab.id) || row.tab.id === activeId)

const canDrag = (group: SessionGroup) => !isRanked && isSortableGroup(group)

// Only the rendered rows take part in a drag. The rest of the group stays behind them: left out,
// rows never arranged would come first and push the dragged ones out of view.
const reorder = (
  entry: { rows: SessionRowItem[]; allRows: SessionRowItem[] },
  rows: SessionRowItem[]
) =>
  emit(
    'reorder',
    [...rows, ...entry.allRows.slice(entry.rows.length)].map((row) => row.key)
  )

// A list scrolled down would leave the new state rising above the view. The scroller goes back to
// the top while the old list keeps its place on screen for its fade.
const keepInPlace = (leaving: Element) => {
  const area = scroller.value
  if (!area || !(leaving instanceof HTMLElement)) return
  leaving.style.top = `${-area.scrollTop}px`
  area.scrollTop = 0
}

const removeAll = (rows: SessionRowItem[]) =>
  actions.removeAll(rows.map((row) => targetOfTab(row.tab)))

// The list enters, from its skeleton or for another machine: its rows stagger in once. Rows that
// arrive later (a batch, a session moving groups) only fade, the stagger would delay them.
watch(
  () => [hasRows, machine] as const,
  ([isFilled]) => {
    if (!isFilled) return
    void enter()
  },
  { immediate: true }
)
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <!-- The one scroll area of the sidebar: group headings stick to its top. `relative` makes it
         the sections' offset parent, which tells the stuck heading. -->
    <div
      ref="scroller"
      class="relative flex min-h-0 flex-1 scroll-pt-10 flex-col overflow-y-auto px-2 pb-3"
    >
      <SessionListSkeleton v-if="!hasRows && isPending" />
      <!-- The state that goes (the groups after the last chat closed, the empty state once one
           opens) fades out on top in half the time while the new one rises in; no out-in wait.
           The skeleton stays outside: it hands over at once. -->
      <Transition
        v-else
        leave-active-class="pointer-events-none absolute inset-x-2 top-0 bottom-3 transition-opacity duration-100 ease-out"
        leave-to-class="opacity-0"
        @before-leave="keepInPlace"
      >
        <NchEmpty
          v-if="!hasRows && isError"
          :icon="ServerOff"
          :title="t('sidebar.offline_title', { machine: machineLabel })"
          :hint="t('sidebar.offline_hint')"
          :size="emptySize"
          :class="EMPTY_ENTER"
        >
          <Button variant="outline" size="sm" @click="emit('retry')">
            <RefreshCw aria-hidden="true" />
            {{ t('sidebar.retry') }}
          </Button>
        </NchEmpty>
        <!-- On a phone the list is the home screen: an empty one is the sleeping Clawd. Beside an
         open chat on wider screens a second Clawd would only repeat the one in the chat. -->
        <div
          v-else-if="!hasRows && isPhone"
          class="flex flex-1 flex-col px-1 pt-2"
          :class="EMPTY_ENTER"
        >
          <NchClawdEmpty :title="t('sidebar.empty_title')" :hint="t('sidebar.empty_hint_phone')">
            <Button variant="outline" @click="emit('new')">
              <Plus aria-hidden="true" />
              {{ t('sidebar.new_session') }}
            </Button>
          </NchClawdEmpty>
        </div>
        <!-- No sessions at all: one state for the whole list, not an empty line per group. -->
        <NchEmpty
          v-else-if="!hasRows"
          :icon="MessageSquareDashed"
          :title="t('sidebar.empty_title')"
          :hint="t('sidebar.empty_hint', { key: labelOf(NEW_SESSION_CHORD) })"
          size="sm"
          :class="EMPTY_ENTER"
        >
          <Button variant="outline" size="sm" @click="emit('new')">
            <Plus aria-hidden="true" />
            {{ t('sidebar.new_session') }}
          </Button>
        </NchEmpty>
        <NchEmpty
          v-else-if="!groups.length"
          :icon="SearchX"
          :title="t('sidebar.no_match_title')"
          :hint="t('sidebar.no_match_hint', { query })"
          :size="emptySize"
          :class="EMPTY_ENTER"
        >
          <Button variant="outline" size="sm" @click="emit('resetSearch')">
            <RotateCcw aria-hidden="true" />
            {{ t('sidebar.reset_search') }}
          </Button>
        </NchEmpty>
        <!-- Not positioned: the sections measure their offsets from the scroller. -->
        <div v-else ref="groupList" class="flex flex-col">
          <section
            v-for="entry in shownGroups"
            :key="entry.group"
            :aria-labelledby="`session-group-${entry.group}`"
            :data-section="entry.group"
          >
            <SessionGroupHeader
              :group="entry.group"
              :count="entry.allRows.length"
              :unseen-count="unseenCounts.get(entry.group) ?? 0"
              :can-remove-all="entry.group === 'done' && entry.allRows.length > 0"
              :is-stuck="entry.group === stuckGroup"
              :class="{ 'motion-fade-in': isEntering }"
              @remove-all="removeAll(entry.allRows)"
            />
            <NchSectionEmpty
              v-if="!entry.allRows.length && isAlwaysShownGroup(entry.group)"
              :icon="EMPTY_ICON[entry.group]"
              :title="t(`sidebar.group_empty.${entry.group}.title`)"
              :hint="emptyHintOf(entry.group)"
              class="py-2 pr-2.5 pl-3"
              :class="{ 'motion-fade-in': isEntering }"
            />
            <!-- The group follows the status; inside "needs" and "running" the user's drag order
             holds. Finished groups stay in the order they finished. -->
            <VueDraggable
              v-else
              :model-value="entry.rows"
              target=".sort-target"
              handle="[data-drag-handle]"
              :disabled="!canDrag(entry.group)"
              v-bind="dragOptions"
              @update:model-value="(rows: SessionRowItem[]) => reorder(entry, rows)"
            >
              <!-- A row that moves into this group fades in; leaving is instant, the user is already looking elsewhere. -->
              <TransitionGroup
                tag="ul"
                class="sort-target flex flex-col gap-0.5 select-none"
                enter-active-class="transition-opacity duration-150 ease-out-soft"
                enter-from-class="opacity-0"
              >
                <li
                  v-for="(row, index) in entry.rows"
                  :key="row.key"
                  :class="{ 'motion-stagger': isEntering }"
                  :style="isEntering ? { '--stagger-index': entry.start + index } : undefined"
                >
                  <SessionRow
                    :row
                    :now
                    :is-wide
                    :is-sortable="canDrag(entry.group)"
                    :is-seen="isSeenRow(entry.group, row)"
                    :is-active="row.tab.id === activeId"
                    @open="emit('open', row)"
                  />
                </li>
              </TransitionGroup>
            </VueDraggable>
          </section>
          <p v-if="isAllShown" class="pt-4 text-center text-meta text-muted-foreground">
            {{ t('sidebar.all_loaded', { n: totalRows }) }}
          </p>
        </div>
      </Transition>
    </div>
    <!-- Over the quota footer, or the bottom nav on a phone. -->
    <NchScrollEdge edge="bottom" :is-shown="hasMoreBelow" />
  </div>
</template>
