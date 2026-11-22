import { computed } from 'vue'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import { usePerMachineQueries } from '@/composables/usePerMachineQueries'

/** An agentd from before `hello` carried its request id never answers it; give up early. */
const HELLO_TIMEOUT_MS = 15 * 1000
/** The version only changes with a deploy. */
const HELLO_STALE_TIME_MS = 5 * 60 * 1000

/** What a machine's agentd said about its version: the version, still asking, or nothing. */
export type AgentdVersion = { state: 'known'; version: string } | { state: 'asking' | 'none' }

const fetchVersion = async (machine: Machine): Promise<string> =>
  (await agentdService.ask<'hello'>({ op: 'hello' }, machine, HELLO_TIMEOUT_MS)).version

/** The agentd version on each machine. */
export const useAgentdVersions = () => {
  const { answers, fetchingMachines, refetch } = usePerMachineQueries((machine) => ({
    queryKey: ['agentd', 'hello', machine],
    queryFn: () => fetchVersion(machine),
    staleTime: HELLO_STALE_TIME_MS,
    refetchInterval: HELLO_STALE_TIME_MS
  }))

  const versions = computed(
    () => new Map<Machine, string>(answers.value.map(({ machine, data }) => [machine, data]))
  )

  // Asking covers the first load and a retry after a failure alike.
  const versionOf = (machine: Machine): AgentdVersion => {
    const version = versions.value.get(machine)
    if (version) return { state: 'known', version }
    return { state: fetchingMachines.value.includes(machine) ? 'asking' : 'none' }
  }

  return { versionOf, refetch }
}
