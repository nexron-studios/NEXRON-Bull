import { useQuery } from '@tanstack/vue-query'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import { useMachineEntries } from '@/composables/useAgentdCatalog'
import { machineOsList, type MachineOs } from '@/types/machine.type'

/** An agentd from before `hello` carried its request id never answers it; give up early. */
const HELLO_TIMEOUT_MS = 15 * 1000

/**
 * The system each machine runs: this computer's from its agentd (in a browser that is the
 * bridge's machine), the others from Bull's machine list. Unknown counts as Windows, like there.
 */
export const useMachineOs = () => {
  const entries = useMachineEntries()
  const thisComputer = useQuery({
    queryKey: ['agentd', 'hello', 'os', null],
    queryFn: async () =>
      (await agentdService.ask<'hello'>({ op: 'hello' }, null, HELLO_TIMEOUT_MS)).os,
    staleTime: Infinity
  })

  const osOf = (machine: Machine): MachineOs => {
    const os =
      machine === null
        ? thisComputer.data.value
        : entries.data.value?.find((entry) => entry.name === machine)?.os
    return machineOsList.find((known) => known === os) ?? 'windows'
  }

  return { osOf }
}
