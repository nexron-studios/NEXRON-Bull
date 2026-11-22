<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { refAutoReset, useScroll } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import OverviewDoneDayHeader from '@/components/overview/OverviewDoneDayHeader.vue'
import OverviewDoneRow from '@/components/overview/OverviewDoneRow.vue'
import OverviewDoneSkeleton from '@/components/overview/OverviewDoneSkeleton.vue'
import { useRenderBatches } from '@/composables/useRenderBatches'
import { useScrollMemory } from '@/composables/useScrollMemory'
import { useStaggerEntrance } from '@/composables/useStaggerEntrance'
import { useStuckSection } from '@/composables/useStuckSection'
import type { FinishedSection } from '@/utils/finishedList'
import type { DoneSession } from '@/utils/overview'
import { sliceGroups } from '@/utils/renderBatch'

// The rows of the "done" list, a card per day. The page is the one scroll area: the list renders
// its first batch, then more whenever the page nears its end. Coming back from a chat restores the
// position; a new search, filter, order or range starts at the top of the list.
const { sections, now, scroller, start, barHeight, resetOn, isComplete } = defineProps<{
  sections: FinishedSection[]
  now: number
  /** The page's scroll area, which the list scrolls with */
  scroller: HTMLElement | null
  /** Where the list section begins, with its heading and search; a reset scrolls back to it */
  start: HTMLElement | null
  /** Height of the sticky bar above the list, in px; the day headings stick below it */
  barHeight: number
  /** Changes when search, filters, order or range change */
  resetOn: string
  /** No machine is still loading; a kept scroll position no longer waits for more rows */
  isComplete: boolean
}>()
const emit = defineEmits<{ resume: [entry: DoneSession] }>()

/** The day whose heading is stuck below the bar; the bar drops its own edge meanwhile. */
const stuckDay = defineModel<string | null>('stuckDay', { default: null })

/** A new batch fades in for 150 ms; the window covers it with room to spare. */
const APPEND_WINDOW_MS = 500
/** Placeholder rows at the end while more rows wait to be rendered. */
const PENDING_ROWS = 2

const root = useTemplateRef<HTMLElement>('root')
const isAppending = refAutoReset(false, APPEND_WINDOW_MS)
/** The first row in view when the list entered; the cascade counts from it, not from the top. */
const staggerFrom = ref(0)

const { t } = useI18n()
const { isEntering, enter, replay } = useStaggerEntrance(root)
const { y } = useScroll(() => scroller)
// The day sections' offset parent is the page, so its scroll position plus the bar says which
// heading sits stuck below the bar.
const stuckSection = useStuckSection(root, () => y.value + barHeight)
const total = computed(() => sections.reduce((sum, entry) => sum + entry.rows.length, 0))

// Back to the heading and search, not to the top of the page: the sections above stay away.
const scrollToStart = (element: HTMLElement) => {
  if (!start) return
  const top =
    start.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop
  if (element.scrollTop > top) element.scrollTo({ top })
}

const memory = useScrollMemory(
  'overview-done',
  () => scroller,
  () => start,
  total,
  () => isComplete,
  () => limit.value
)
const { limit, hasMore, isAllShown } = useRenderBatches(
  () => scroller,
  total,
  -1,
  () => resetOn,
  { initialLimit: memory.limit, scrollToStart }
)
const shown = computed(() => sliceGroups(sections, limit.value))

// A row's scroll margin is what the bar and the stuck day heading cover above it.
const firstRowInView = () => {
  if (!root.value || !scroller) return 0
  const rows = [...root.value.querySelectorAll<HTMLElement>('li[data-index]')]
  const visible = rows.find(
    (row) =>
      row.getBoundingClientRect().bottom >
      scroller.getBoundingClientRect().top + parseFloat(getComputedStyle(row).scrollMarginTop)
  )
  return Number(visible?.dataset.index ?? 0)
}
// Rows above the first one in view stay out of the cascade; they would slide under the bar.
const staggerIndexOf = (position: number) =>
  isEntering.value && position >= staggerFrom.value ? position - staggerFrom.value : null

watch(stuckSection, (key) => {
  stuckDay.value = key
})
// A chat that just finished slides in on top (320 ms, the Agent Dashboard's timing, kept from the
// finish strip); the rows of a new batch only fade, they come in where the reader looks.
watch(limit, (next, before) => {
  if (next > before) isAppending.value = true
})
// The list enters, from its skeleton or with a new search: its rows stagger in once. Back from
// a chat further down, the cascade starts at the first row in view; counted from the top, every
// row past the cap came in as one block.
watch(
  () => resetOn,
  () => {
    staggerFrom.value = 0
    void enter()
  },
  { immediate: true }
)
// A late restore lands mid-cascade or after it: the rows in view enter again from the start.
memory.onRestored(() => {
  staggerFrom.value = firstRowInView()
  void replay()
})
</script>

<template>
  <!-- A tall window shows a dozen rows and more: the cascade runs one step longer than usual. -->
  <div ref="root" class="flex flex-1 flex-col [--stagger-cap:7]">
    <slot v-if="!total" name="empty" />
    <section
      v-for="entry in shown"
      :key="entry.key"
      :data-section="entry.key"
      :aria-labelledby="entry.day === null ? undefined : `done-day-${entry.key}`"
    >
      <OverviewDoneDayHeader
        v-if="entry.day !== null"
        :day="entry.day"
        :now
        :count="entry.allRows.length"
        :heading-id="`done-day-${entry.key}`"
        :is-stuck="entry.key === stuckDay"
      />
      <TransitionGroup
        tag="ul"
        class="@container divide-y divide-border overflow-y-clip rounded-xl border bg-card"
        :enter-active-class="
          isAppending
            ? 'transition-opacity duration-150 ease-out-soft'
            : 'transition duration-320 ease-out-soft'
        "
        :enter-from-class="isAppending ? 'opacity-0' : '-translate-x-4 opacity-0'"
        move-class="transition-transform duration-320 ease-out-soft"
        leave-active-class="hidden"
      >
        <OverviewDoneRow
          v-for="(row, index) in entry.rows"
          :key="row.key"
          :entry="row"
          :data-index="entry.start + index"
          :stagger-index="staggerIndexOf(entry.start + index)"
          :now
          @resume="emit('resume', row)"
        />
      </TransitionGroup>
    </section>
    <OverviewDoneSkeleton v-if="hasMore" :rows="PENDING_ROWS" class="mt-3" />
    <p v-if="isAllShown" class="pt-4 text-center text-meta text-muted-foreground">
      {{ t('overview.done_all_loaded', { n: total }) }}
    </p>
  </div>
</template>
