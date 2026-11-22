import type { Machine } from '@/api/services/agentd.service'

/**
 * Names the user gave machines, by `machineKeyOf`. Only shown: tabs, queries and Bull's list keep
 * calling a machine by its own name, so renaming never touches a running chat.
 */
export type MachineNames = Readonly<Record<string, string>>

/** As long as Bull's list allows for a machine's own name. */
export const MAX_MACHINE_NAME_CHARS = 40

/** This computer has no name of its own to file a custom one under. */
const THIS_MACHINE_KEY = ''

const machineKeyOf = (machine: Machine): string => machine ?? THIS_MACHINE_KEY

/** What a machine is called without a name from the user: its own, or "this PC". */
export const defaultMachineNameOf = (machine: Machine, thisMachineLabel: string): string =>
  machine ?? thisMachineLabel

/** What the user calls the machine: the name they gave it, else its default. */
export const machineNameOf = (
  machine: Machine,
  names: MachineNames,
  thisMachineLabel: string
): string => names[machineKeyOf(machine)] ?? defaultMachineNameOf(machine, thisMachineLabel)

/** The names with `name` for `machine`; an empty name or the default one drops the entry. */
export const withMachineName = (
  names: MachineNames,
  machine: Machine,
  name: string,
  defaultName: string
): MachineNames => {
  const key = machineKeyOf(machine)
  const trimmed = name.trim().slice(0, MAX_MACHINE_NAME_CHARS)
  const { [key]: _previous, ...others } = names
  if (!trimmed || trimmed === defaultName) return others
  return { ...others, [key]: trimmed }
}

/** Whether another machine already shows this name, which would make the two indistinguishable. */
export const isMachineNameTaken = (name: string, otherNames: readonly string[]): boolean => {
  const wanted = name.trim().toLowerCase()
  return !!wanted && otherNames.some((other) => other.toLowerCase() === wanted)
}

/** Another machine by its name; this computer only while there is a second one to pick. */
export const machineLabelOf = (
  machine: Machine,
  hasOtherMachines: boolean,
  name: string
): string | null => (machine === null && !hasOtherMachines ? null : name)
