import { computed, ref, toValue, watch, type MaybeRefOrGetter, type WatchSource } from 'vue'
import { useElementSize, useInfiniteScroll } from '@vueuse/core'
import { FIRST_BATCH_SIZE, NEXT_BATCH_SIZE } from '@/utils/renderBatch'

/** The next batch is rendered while the end is still this far below the visible part. */
const LOAD_DISTANCE_PX = 240

export interface RenderBatchOptions {
  /** Rows rendered from the start, e.g. as many as before leaving the view */
  initialLimit?: number
  /** Where a reset scrolls to; the top of the scroller unless the list sits further down in it */
  scrollToStart?: (scroller: HTMLElement) => void
}

const scrollToTop = (scroller: HTMLElement) => scroller.scrollTo({ top: 0 })

/**
 * How many rows of an already loaded list are rendered: the first batch, then more while the
 * list scrolls towards its end. The row at `pinnedIndex` (-1 for none) is always rendered, also
 * past the batches scrolled to so far. A change of `resetOn` (search, machine) starts at the top
 * again.
 */
export const useRenderBatches = (
  scroller: MaybeRefOrGetter<HTMLElement | null>,
  total: MaybeRefOrGetter<number>,
  pinnedIndex: MaybeRefOrGetter<number>,
  resetOn: WatchSource,
  { initialLimit = FIRST_BATCH_SIZE, scrollToStart = scrollToTop }: RenderBatchOptions = {}
) => {
  const scrolledLimit = ref(Math.max(initialLimit, FIRST_BATCH_SIZE))
  const { height } = useElementSize(scroller)
  const limit = computed(() => Math.max(scrolledLimit.value, toValue(pinnedIndex) + 1))
  const hasMore = computed(() => limit.value < toValue(total))
  /** Nothing left to render, and there was more than the first batch: worth saying so. */
  const isAllShown = computed(() => !hasMore.value && toValue(total) > FIRST_BATCH_SIZE)

  const { reset } = useInfiniteScroll(
    scroller,
    () => {
      // From what is on screen: a pinned row further down already raised it.
      scrolledLimit.value = limit.value + NEXT_BATCH_SIZE
    },
    // A list without height yet (window still hidden at start) counts as "not filled" and would
    // load every batch at once.
    { distance: LOAD_DISTANCE_PX, canLoadMore: () => hasMore.value && height.value > 0 }
  )

  watch(resetOn, () => {
    scrolledLimit.value = FIRST_BATCH_SIZE
    const element = toValue(scroller)
    if (element) scrollToStart(element)
    // A list that still reached its end before the reset gives no new scroll to react to.
    reset()
  })

  return { limit, hasMore, isAllShown }
}
