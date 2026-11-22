import { createGlobalState, useStorage } from '@vueuse/core'
import type { Machine } from '@/api/services/agentd.service'
import i18n from '@/i18n'
import {
  defaultMachineNameOf,
  machineNameOf,
  withMachineName,
  type MachineNames
} from '@/utils/machineLabel'

const NAMES_STORAGE_KEY = 'bull.machines.names'

const useNameState = createGlobalState(() =>
  useStorage<MachineNames>(NAMES_STORAGE_KEY, {}, localStorage)
)

/**
 * The names the user gave this computer and the others (Settings › Machines). Kept in the app,
 * not in Bull's list: this computer has no entry there, and a machine's own name stays its key.
 * Reads `i18n.global`, so the error handler and stores outside a component can ask too.
 */
export const useMachineNames = () => {
  const names = useNameState()
  const thisMachineLabel = () => i18n.global.t('chat.this_machine')

  const nameOf = (machine: Machine): string =>
    machineNameOf(machine, names.value, thisMachineLabel())

  const defaultNameOf = (machine: Machine): string =>
    defaultMachineNameOf(machine, thisMachineLabel())

  /** An empty name gives the machine its default one back. */
  const rename = (machine: Machine, name: string) => {
    names.value = withMachineName(names.value, machine, name, defaultNameOf(machine))
  }

  return { nameOf, defaultNameOf, rename }
}
