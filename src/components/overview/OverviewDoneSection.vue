<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import {
  CalendarRange,
  CircleAlert,
  History,
  ListX,
  Plus,
  RotateCcw,
  SearchX,
  ServerOff
} from '@lucide/vue'
import { useElementSize, useScroll } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import NchEmpty from '@/components/common/NchEmpty.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchRangeSwitch from '@/components/common/NchRangeSwitch.vue'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import OverviewDoneControls from '@/components/overview/OverviewDoneControls.vue'
import OverviewDoneList from '@/components/overview/OverviewDoneList.vue'
import OverviewDoneSkeleton from '@/components/overview/OverviewDoneSkeleton.vue'
import { useFinishedList } from '@/composables/useFinishedList'
import { doneRangeList, type DoneRange, type DoneSession, type RankedDone } from '@/utils/overview'

// "Fertig": finished sessions of every machine, one continuous list in the page's scroll area.
// Ordered by date it falls into days; the chats not seen yet lead their day with their finish
// number. One list since the Figma section "Fassung 6": the strip above it showed the same chats a
// second time. The open tabs are known before any transcript list arrives, so their rows stay
// while those load or fail. Search, filters and order narrow it in the browser; "remove all" takes
// what they let through, also the rows not rendered yet.
const { done, isPending, hasLoadingMachines, scroller } = defineProps<{
  done: RankedDone[]
  now: number
  isPending: boolean
  isError: boolean
  /** SSH hosts whose list did not arrive; the others are still shown */
  failedMachines: string[]
  /** SSH hosts whose list has not arrived yet */
  hasLoadingMachines: boolean
  /** The page's scroll area; the bar and the day headings stick to its top */
  scroller: HTMLElement | null
}>()
const emit = defineEmits<{
  resume: [entry: DoneSession]
  removeAll: [entries: RankedDone[]]
  retry: []
  new: []
}>()

const range = defineModel<DoneRange>('range', { required: true })

/** Rows the skeleton shows while the lists load. */
const SKELETON_ROWS = 3

/** From this width the heading has room for the label of "remove all", in px. */
const LABELLED_HEADING_MIN_WIDTH_PX = 512

const section = useTemplateRef<HTMLElement>('section')
const bar = useTemplateRef<HTMLElement>('bar')
const stuckDay = ref<string | null>(null)

const { t } = useI18n()
const { height: barHeight } = useElementSize(bar, undefined, { box: 'border-box' })
const { width: sectionWidth } = useElementSize(section)
const { y } = useScroll(() => scroller)
const { search, account, machine, sort, matches, sections, options, isNarrowed, reset } =
  useFinishedList(() => done)

const newCount = computed(() => matches.value.filter((entry) => entry.rank !== null).length)
const rangeOptions = computed(() =>
  doneRangeList.map((value) => ({ value, label: t(`overview.ranges.${value}`) }))
)
// Not measured yet (0) counts as wide, so a desktop never flashes the icon-only button.
const isCompact = computed(
  () => sectionWidth.value > 0 && sectionWidth.value < LABELLED_HEADING_MIN_WIDTH_PX
)
const removeAllLabel = computed(() =>
  isNarrowed.value
    ? t('overview.remove_matches', { n: matches.value.length }, matches.value.length)
    : t('session_actions.remove_all')
)
// The page is the bar's offset parent: past the section's start the bar is stuck. A day heading
// stuck below it casts the edge instead, so there is one shadow, at the lowest bar.
const isBarEdgeShown = computed(
  () => !!section.value && y.value > section.value.offsetTop && stuckDay.value === null
)
const hasRows = computed(() => !isPending && done.length > 0)
/** Every machine has answered or failed: the rows a scroll position was kept for are there. */
const isComplete = computed(() => hasRows.value && !hasLoadingMachines)
/** The next longer range, which may hold what this one does not; none after "all". */
const widerRange = computed(() => doneRangeList[doneRangeList.indexOf(range.value) + 1] ?? null)
const resetKey = computed(() =>
  JSON.stringify([search.value, account.value, machine.value, sort.value, range.value])
)

const widen = () => {
  if (widerRange.value) range.value = widerRange.value
}
</script>

<template>
  <section
    ref="section"
    class="flex flex-1 flex-col gap-3"
    aria-labelledby="overview-done"
    :style="{ '--done-bar-height': `${barHeight}px` }"
  >
    <!-- The heading sticks to the top of the page while the list scrolls under it, so the count
         stays in sight. Search and filters scroll away like the search field in Apple Mail: kept
         in the bar they took a fifth of a phone screen. -->
    <div ref="bar" class="sticky top-0 z-20 -mt-3 flex items-center gap-2 material py-3">
      <History class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <h2 id="overview-done" class="text-body font-semibold">{{ t('overview.done') }}</h2>
      <span
        v-if="!isPending"
        class="rounded-full bg-muted px-1.5 text-meta text-muted-foreground tabular-nums"
        >{{ matches.length }}</span
      >
      <span
        v-if="newCount"
        class="text-meta font-semibold whitespace-nowrap text-good tabular-nums"
      >
        {{ t('finish.new_count', { n: newCount }) }}
      </span>
      <div class="ml-auto flex items-center gap-2">
        <!-- Narrow, the label would push the range switch into a second line. -->
        <template v-if="!isPending && matches.length">
          <NchIconButton
            v-if="isCompact"
            :label="removeAllLabel"
            class="motion-press touch-manipulation text-muted-foreground pointer-coarse:size-9"
            @click="emit('removeAll', matches)"
          >
            <ListX aria-hidden="true" />
          </NchIconButton>
          <Button
            v-else
            variant="ghost"
            size="sm"
            class="motion-press touch-manipulation text-muted-foreground pointer-coarse:h-9"
            @click="emit('removeAll', matches)"
          >
            <ListX aria-hidden="true" />
            {{ removeAllLabel }}
          </Button>
        </template>
        <NchRangeSwitch
          v-model="range"
          :options="rangeOptions"
          :label="t('overview.range_label')"
        />
      </div>
      <NchScrollEdge edge="below" :is-shown="isBarEdgeShown" />
    </div>

    <OverviewDoneControls
      v-if="done.length"
      v-model:search="search"
      v-model:account="account"
      v-model:machine="machine"
      v-model:sort="sort"
      :accounts="options.accounts"
      :machines="options.machines"
    />

    <p
      v-if="failedMachines.length"
      class="motion-shake flex flex-wrap items-center gap-2 text-small text-muted-foreground"
      role="status"
    >
      <ServerOff class="size-4 shrink-0" aria-hidden="true" />
      {{ t('overview.machines_failed', { machines: failedMachines.join(', ') }) }}
      <Button class="motion-press" variant="outline" size="sm" @click="emit('retry')">{{
        t('sidebar.retry')
      }}</Button>
    </p>

    <!-- In the shape of what comes: search and order, a day heading, rows. -->
    <div v-if="isPending" role="status" class="flex flex-col">
      <span class="sr-only">{{ t('overview.loading') }}</span>
      <div class="flex flex-wrap items-center gap-2" aria-hidden="true">
        <Skeleton class="h-9 max-w-md min-w-48 flex-1 rounded-md" />
        <Skeleton class="h-9 w-72 rounded-md @2xl:ml-auto" />
      </div>
      <Skeleton class="mt-6 mb-3 h-3 w-24 rounded-full" aria-hidden="true" />
      <OverviewDoneSkeleton :rows="SKELETON_ROWS" />
    </div>
    <div v-else-if="isError" class="motion-shake flex rounded-xl border bg-card">
      <NchEmpty
        size="sm"
        :icon="CircleAlert"
        :title="t('overview.done_error_title')"
        :hint="t('overview.done_error_hint')"
      >
        <Button class="motion-press" variant="outline" size="sm" @click="emit('retry')">{{
          t('usage.retry')
        }}</Button>
      </NchEmpty>
    </div>

    <!-- Mounted while a search matches nothing too, so the next search still starts at the top. -->
    <OverviewDoneList
      v-if="hasRows"
      :sections
      :now
      :scroller
      v-model:stuck-day="stuckDay"
      :start="section"
      :bar-height="barHeight"
      :reset-on="resetKey"
      :is-complete="isComplete"
      @resume="(entry) => emit('resume', entry)"
    >
      <template #empty>
        <div class="motion-fade-in flex flex-1 rounded-xl border bg-card">
          <NchEmpty
            size="sm"
            :icon="SearchX"
            :title="t('overview.done_controls.no_match_title')"
            :hint="t('overview.done_controls.no_match_hint')"
          >
            <Button
              variant="outline"
              size="sm"
              class="motion-press touch-manipulation"
              @click="reset"
            >
              <RotateCcw aria-hidden="true" />
              {{ t('overview.done_controls.reset') }}
            </Button>
          </NchEmpty>
        </div>
      </template>
    </OverviewDoneList>
    <!-- Like "nothing matches", it fills the rest of the page, where the rows would be. -->
    <div
      v-else-if="!isPending && !isError && !done.length"
      class="motion-fade-in flex flex-1 rounded-xl border bg-card"
    >
      <NchEmpty
        size="sm"
        :icon="History"
        :title="t('overview.done_empty_title')"
        :hint="t(`overview.done_empty_hint.${range}`)"
      >
        <Button
          v-if="widerRange"
          variant="outline"
          size="sm"
          class="motion-press touch-manipulation"
          @click="widen"
        >
          <CalendarRange aria-hidden="true" />
          {{ t(`overview.done_widen.${widerRange}`) }}
        </Button>
        <Button
          v-else
          variant="outline"
          size="sm"
          class="motion-press touch-manipulation"
          @click="emit('new')"
        >
          <Plus aria-hidden="true" />
          {{ t('sidebar.new_session') }}
        </Button>
      </NchEmpty>
    </div>
  </section>
</template>
