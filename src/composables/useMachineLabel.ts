import type { Machine } from '@/api/services/agentd.service'
import { useHasOtherMachines } from '@/composables/useAgentdCatalog'
import { useMachineNames } from '@/composables/useMachineNames'
import { machineLabelOf } from '@/utils/machineLabel'

/**
 * The name to show for a machine. "This PC" only appears while there is another machine to tell
 * it from; with this computer alone the label is `null` and the place for it goes away. The rule
 * counts machines, not SSH hosts, so a phone paired later counts too.
 */
export const useMachineLabel = () => {
  const hasOtherMachines = useHasOtherMachines()
  const { nameOf } = useMachineNames()

  const labelOf = (machine: Machine): string | null =>
    machineLabelOf(machine, hasOtherMachines.value, nameOf(machine))

  return { hasOtherMachines, labelOf }
}
