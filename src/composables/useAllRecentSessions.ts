import { computed } from 'vue'
import { fetchRecent, recentKey } from '@/composables/useAgentdCatalog'
import { usePerMachineQueries } from '@/composables/usePerMachineQueries'
import { useHiddenSessionsStore } from '@/stores/hiddenSessions'

/** Sessions started elsewhere (a terminal, another app) only show up by asking again. */
const RECENT_POLL_MS = 60 * 1000
/** A turn that ends or a tab that closes invalidates the list anyway; this covers a remount. */
const RECENT_STALE_TIME_MS = 15 * 1000

/**
 * The recent sessions of this computer and every SSH host, for the overview. Each machine fails
 * on its own: an offline host is listed in `failedMachines`, the others stay readable.
 */
export const useAllRecentSessions = () => {
  const { answers, isPending, isError, isFetching, failedMachines, loadingMachines, refetch } =
    usePerMachineQueries((machine) => ({
      queryKey: recentKey(machine),
      queryFn: () => fetchRecent(machine),
      staleTime: RECENT_STALE_TIME_MS,
      refetchInterval: RECENT_POLL_MS
    }))

  const hidden = useHiddenSessionsStore()
  const perMachine = computed(() =>
    answers.value.map(({ machine, data }) => ({
      machine,
      sessions: hidden.visibleOf(machine, data)
    }))
  )

  return { perMachine, isPending, isError, isFetching, failedMachines, loadingMachines, refetch }
}
