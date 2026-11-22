import { computed } from 'vue'
import { useQueries, type QueryKey } from '@tanstack/vue-query'
import type { Machine } from '@/api/services/agentd.service'
import { useMachines } from '@/composables/useAgentdCatalog'

/** What each machine's query needs; the helper adds the machine list and the shared defaults. */
export interface PerMachineQuery<T> {
  queryKey: QueryKey
  queryFn: () => Promise<T>
  staleTime: number
  /** A function can stop polling a machine, e.g. while it does not answer */
  refetchInterval: number | ((query: { state: { status: string } }) => number | false)
  /** `false` reads the cache without fetching; default on */
  enabled?: boolean
  placeholderData?: (previous: T | undefined) => T | undefined
}

/**
 * One query per machine: this computer first, then every SSH host. Each machine fails on its
 * own, so an offline host leaves the others readable; `isPending`/`isError` follow this computer,
 * the remote ones are listed in `loadingMachines`/`failedMachines`.
 */
export const usePerMachineQueries = <T>(queryOf: (machine: Machine) => PerMachineQuery<T>) => {
  const { data: remoteMachines } = useMachines()

  const machines = computed<Machine[]>(() => [null, ...(remoteMachines.value ?? [])])
  const queries = useQueries({
    queries: computed(() =>
      machines.value.map((machine) => ({
        ...queryOf(machine),
        // An offline machine keeps failing; its note says so, retries only delay it.
        retry: machine === null ? 1 : 0
      }))
    )
  })

  const answers = computed(() =>
    machines.value.flatMap((machine, index) => {
      const data = queries.value[index]?.data as T | undefined
      return data === undefined ? [] : [{ machine, data }]
    })
  )
  const remoteWhere = (has: (index: number) => boolean | undefined) =>
    machines.value.filter((machine, index): machine is string => machine !== null && !!has(index))

  const isPending = computed(() => queries.value[0]?.isPending ?? true)
  const isError = computed(() => queries.value[0]?.isError ?? false)
  const isFetching = computed(() => queries.value.some((query) => query.isFetching))
  const isPlaceholder = computed(() => queries.value.some((query) => query.isPlaceholderData))
  const loadingMachines = computed(() => remoteWhere((i) => queries.value[i]?.isPending))
  const failedMachines = computed(() => remoteWhere((i) => queries.value[i]?.isError))
  /** Every machine, this computer included, whose query runs right now (first load or refetch). */
  const fetchingMachines = computed(() =>
    machines.value.filter((_, index) => queries.value[index]?.isFetching)
  )
  /** When each machine last answered (ms); missing until its first answer. */
  const answeredAt = computed(
    () =>
      new Map<Machine, number>(
        machines.value.flatMap((machine, index) => {
          const at = queries.value[index]?.dataUpdatedAt
          return at ? [[machine, at] as const] : []
        })
      )
  )
  const refetch = () => Promise.allSettled(queries.value.map((query) => query.refetch()))

  return {
    machines,
    answers,
    answeredAt,
    isPending,
    isError,
    isFetching,
    isPlaceholder,
    loadingMachines,
    failedMachines,
    fetchingMachines,
    refetch
  }
}
