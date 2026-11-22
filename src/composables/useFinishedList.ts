import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useFuse } from '@vueuse/integrations/useFuse'
import { useRouteQuery } from '@vueuse/router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { summaryOf } from '@/utils/finishOrder'
import {
  ALL_FILTER,
  DEFAULT_FINISHED_SORT,
  filterFinished,
  filterOptionsOf,
  parseFilter,
  parseFinishedSort,
  parseSearch,
  sectionsOf,
  sortFinished,
  type FinishedSort,
  type SearchableDone
} from '@/utils/finishedList'
import type { RankedDone } from '@/utils/overview'
import { folderNameOf } from '@/utils/sessionList'

const FUSE_THRESHOLD = 0.3

// Titles are what a person remembers, then the answer and the folder; account and machine least.
const FUSE_KEYS = [
  { name: 'title', weight: 3 },
  { name: 'summary', weight: 2 },
  { name: 'folder', weight: 2 },
  { name: 'account', weight: 1 },
  { name: 'machine', weight: 1 }
]

/**
 * Search, filter and sort of the overview's "done" list, all in the URL so a reload or a link
 * keeps them. The rows arrive complete; everything here happens in the browser, and the list
 * renders the result in batches while it scrolls.
 */
export const useFinishedList = (done: MaybeRefOrGetter<RankedDone[]>) => {
  const { t, locale } = useI18n()
  const { tabs } = storeToRefs(useChatStore())

  const search = useRouteQuery<string, string>('q', '', { transform: { get: parseSearch } })
  const account = useRouteQuery<string, string>('account', ALL_FILTER, {
    transform: { get: parseFilter }
  })
  const machine = useRouteQuery<string, string>('machine', ALL_FILTER, {
    transform: { get: parseFilter }
  })
  const sort = useRouteQuery<string, FinishedSort>('sort', DEFAULT_FINISHED_SORT, {
    transform: { get: parseFinishedSort, set: String }
  })

  const collator = computed(() => new Intl.Collator(locale.value, { sensitivity: 'base' }))
  const machineLabelOf = (entry: RankedDone) => entry.machine ?? t('chat.this_machine')
  const tabById = computed(() => new Map(tabs.value.map((tab) => [tab.id, tab])))
  /** Claude's last answer; only an open tab has its messages loaded. */
  const summaryOfEntry = (entry: RankedDone) => {
    if (entry.source.kind !== 'tab') return ''
    const tab = tabById.value.get(entry.source.tabId)
    return tab ? summaryOf(tab.messages) : ''
  }

  const filters = computed(() => ({ account: account.value, machine: machine.value }))
  const options = computed(() => filterOptionsOf(toValue(done), filters.value, collator.value))
  const filtered = computed(() => filterFinished(toValue(done), filters.value))
  const searchable = computed<SearchableDone[]>(() =>
    filtered.value.map((entry) => ({
      key: entry.key,
      title: entry.title,
      summary: summaryOfEntry(entry),
      folder: folderNameOf(entry.cwd),
      account: entry.account,
      machine: machineLabelOf(entry)
    }))
  )
  // Trimmed here, not in the URL parser: the input shows the search as typed.
  const query = computed(() => search.value.trim())
  const { results } = useFuse(query, searchable, {
    fuseOptions: {
      keys: FUSE_KEYS,
      threshold: FUSE_THRESHOLD,
      ignoreLocation: true,
      ignoreFieldNorm: true
    },
    matchAllWhenSearchEmpty: true
  })
  const matches = computed(() => {
    const byKey = new Map(filtered.value.map((entry) => [entry.key, entry]))
    const found = results.value.flatMap((result) => byKey.get(result.item.key) ?? [])
    return sortFinished(found, sort.value, collator.value)
  })
  const sections = computed(() => sectionsOf(matches.value, sort.value))
  const isNarrowed = computed(
    () => query.value !== '' || account.value !== ALL_FILTER || machine.value !== ALL_FILTER
  )

  const reset = () => {
    search.value = ''
    account.value = ALL_FILTER
    machine.value = ALL_FILTER
  }

  return {
    search,
    account,
    machine,
    sort,
    matches,
    sections,
    options,
    isNarrowed,
    reset
  }
}
