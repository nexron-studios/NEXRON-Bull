import { computed, nextTick, ref, watch, type Ref, type UnwrapNestedRefs } from 'vue'
import { refDebounced } from '@vueuse/core'
import { useFuse } from '@vueuse/integrations/useFuse'
import { useSearchMarks } from '@/composables/useSearchMarks'
import { useLayoutSnap } from '@/composables/useLayoutSnap'
import type { StreamItem } from '@/utils/chatStream'
import {
  hitsOf,
  scrollTargetOf,
  searchEntriesOf,
  steppedIndexOf,
  type SearchHit
} from '@/utils/chatSearch'

// Typing settles for this long before Fuse runs, so a fast word is one search, not five.
const SEARCH_SETTLE_MS = 80
// Loose enough for a typo ("ikon" finds "Icon"), tight enough that a short word stays specific.
const FUSE_THRESHOLD = 0.35
const MIN_MATCH_CHARS = 2
// On <html> while the magnifier and the field morph into each other (Figma "13c"): only then do
// they carry the shared view-transition name.
const MORPH_ATTRIBUTE = 'data-search-morph'

/**
 * The search inside one chat: fuzzy hits over what was said and run, the current hit, and the
 * jump to it on the chat's spring. The marks in the chat are `useSearchMarks`.
 */
export const useChatSearch = (
  stream: Ref<StreamItem[]>,
  scroller: Ref<HTMLElement | null>,
  glideTo: (top: number) => void
) => {
  const query = ref('')
  const isOpen = ref(false)
  // The list of hits shows while typing; a jump folds it so the chat is visible.
  const isListOpen = ref(true)
  const active = ref(0)

  const settled = refDebounced(query, SEARCH_SETTLE_MS)
  const entries = computed(() => searchEntriesOf(stream.value))
  const { results } = useFuse(settled, entries, {
    fuseOptions: {
      keys: ['text'],
      threshold: FUSE_THRESHOLD,
      ignoreLocation: true,
      includeMatches: true,
      minMatchCharLength: MIN_MATCH_CHARS
    }
  })
  const hits = computed<SearchHit[]>(() => (settled.value.trim() ? hitsOf(results.value) : []))
  const isSettled = computed(() => settled.value === query.value)
  const marks = useSearchMarks(scroller, hits, active)
  // The layout snap's queue: a morph never skips a sidebar or panel snap that runs.
  const { snap } = useLayoutSnap(MORPH_ATTRIBUTE)

  const jump = async (index: number) => {
    if (!hits.value.length) return
    active.value = steppedIndexOf(index, 0, hits.value.length)
    isListOpen.value = false
    await nextTick()
    const el = scroller.value
    const hit = hits.value[active.value]
    const offset = hit ? marks.reveal(hit) : null
    if (!el || offset === null) return
    glideTo(scrollTargetOf(offset, el.clientHeight, el.scrollHeight - el.clientHeight))
    marks.paint()
  }
  const step = (delta: number) => void jump(active.value + delta)
  const moveActive = (delta: number) => {
    active.value = steppedIndexOf(active.value, delta, hits.value.length)
  }

  const open = () =>
    void snap(() => {
      isOpen.value = true
      isListOpen.value = true
    }, true)
  const close = () =>
    void snap(() => {
      isOpen.value = false
      query.value = ''
      active.value = 0
      marks.clear()
    }, true)
  const type = (text: string) => {
    query.value = text
    isListOpen.value = true
  }

  // A new term starts at its first hit. Hits that change under the same term (older history
  // loaded, a new reply) keep the current one.
  watch([hits, settled], ([next, term], [previous, previousTerm]) => {
    if (term !== previousTerm) return void (active.value = 0)
    const was = previous[active.value]
    const kept = was ? next.findIndex((hit) => hit.key === was.key && hit.start === was.start) : -1
    active.value = kept !== -1 ? kept : Math.max(0, Math.min(active.value, next.length - 1))
  })
  // New hits, a new current one, or new messages that re-rendered the chat: marks follow.
  watch(
    [hits, active, stream],
    () => {
      if (isOpen.value) marks.paint()
    },
    { flush: 'post' }
  )

  return {
    query,
    isOpen,
    isListOpen,
    isSettled,
    active,
    hits,
    ticks: marks.ticks,
    open,
    close,
    type,
    jump,
    step,
    moveActive
  }
}

/** The search as a component reads it: refs unwrapped, as `reactive()` hands it over. */
export type ChatSearchState = UnwrapNestedRefs<ReturnType<typeof useChatSearch>>
