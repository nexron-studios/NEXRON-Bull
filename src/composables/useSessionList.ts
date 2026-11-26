import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useIntervalFn, useNow } from '@vueuse/core'
import { useFuse } from '@vueuse/integrations/useFuse'
import { storeToRefs } from 'pinia'
import type { Machine } from '@/api/services/agentd.service'
import { useVisibleRecentSessions } from '@/composables/useAgentdCatalog'
import { useSessionOrder } from '@/composables/useSessionOrder'
import { useChatStore } from '@/stores/chat'
import {
  alwaysShownGroupList,
  groupRows,
  isSameSearchable,
  searchableOf,
  sessionRowsOf,
  withManualOrder,
  withStableRows,
  type SearchableRow,
  type SessionGroupEntry,
  type SessionRow
} from '@/utils/sessionList'

/** Ages in the list are whole minutes; a tick every few seconds keeps them close enough. */
const AGE_TICK_MS = 15_000
const FUSE_THRESHOLD = 0.3

// Titles are what a person remembers, folders next, the account least.
const FUSE_KEYS = [
  { name: 'title', weight: 3 },
  { name: 'folder', weight: 2 },
  { name: 'chatName', weight: 2 },
  { name: 'account', weight: 1 }
]

/** The sidebar's sessions of one machine: searched, grouped by what they need, in the user's order. */
export const useSessionList = (
  machine: MaybeRefOrGetter<Machine>,
  query: MaybeRefOrGetter<string>
) => {
  const { tabs } = storeToRefs(useChatStore())
  const recent = useVisibleRecentSessions(machine)
  const now = useNow({ scheduler: (tick) => useIntervalFn(tick, AGE_TICK_MS) })
  const order = useSessionOrder(machine)

  const search = computed(() => toValue(query).trim())
  const isRanked = computed(() => search.value !== '')
  const rows = computed<SessionRow[]>((previous) =>
    withStableRows(
      previous,
      sessionRowsOf(
        tabs.value.filter((tab) => tab.machine === toValue(machine)),
        recent.sessions.value,
        now.value.getTime()
      )
    )
  )
  const rowByKey = computed(() => new Map(rows.value.map((row) => [row.key, row])))
  // Fuse watches its list deeply and indexes it again on every change. Rows change with every
  // streamed token; the flat copy keeps its identity until a title, folder or account changes.
  const searchable = computed<SearchableRow[]>((previous) => {
    const next = searchableOf(rows.value)
    return previous && isSameSearchable(previous, next) ? previous : next
  })
  const { results } = useFuse(search, searchable, {
    // Without the length norm an exact hit in a long title beats a fuzzy one in a short title.
    fuseOptions: {
      keys: FUSE_KEYS,
      threshold: FUSE_THRESHOLD,
      ignoreLocation: true,
      ignoreFieldNorm: true
    },
    matchAllWhenSearchEmpty: true
  })
  const groups = computed<SessionGroupEntry[]>(() => {
    const found = results.value.flatMap((result) => rowByKey.value.get(result.item.key) ?? [])
    // Search hits keep their ranking and show only groups with a hit; the user's order and the
    // groups that stay when empty belong to the full list.
    if (isRanked.value) return groupRows(found, true)
    return withManualOrder(groupRows(found, false, alwaysShownGroupList), order.stored.value)
  })

  /** Stores the order of one group after a drag. */
  const reorder = (keys: string[]) => order.reorder(keys, new Set(rows.value.map((row) => row.key)))

  return {
    rows,
    groups,
    now,
    isRanked,
    // The rows come from the open tabs, but `recent` is the one answer from the machine itself:
    // it decides between skeleton, an empty list and "not reachable".
    isPending: recent.isPending,
    isError: recent.isError,
    refetch: recent.refetch,
    reorder
  }
}
