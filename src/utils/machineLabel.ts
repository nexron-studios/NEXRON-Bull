import type { Machine } from '@/api/services/agentd.service'

/** Another machine by its name; this computer only while there is a second one to pick. */
export const machineLabelOf = (
  machine: Machine,
  hasOtherMachines: boolean,
  thisMachineLabel: string
): string | null => machine ?? (hasOtherMachines ? thisMachineLabel : null)
