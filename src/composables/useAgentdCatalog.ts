import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import { machineService } from '@/api/services/machine.service'
import { useHiddenSessionsStore } from '@/stores/hiddenSessions'
import type { MachineEntry } from '@/types/machine.type'

const RECENT_LIMIT = 30
/** Bull's machine list only changes through the assistant, which refreshes it. */
const MACHINES_STALE_TIME_MS = 5 * 60 * 1000

export const MACHINES_KEY = ['machines'] as const

const machinesQuery = <T>(select: (entries: MachineEntry[]) => T) =>
  useQuery({
    queryKey: MACHINES_KEY,
    queryFn: machineService.list,
    staleTime: MACHINES_STALE_TIME_MS,
    select
  })

/** The names of the other machines, what tabs and queries call them. */
export const useMachines = () => machinesQuery((entries) => entries.map((entry) => entry.name))

/** The other machines with how ssh reaches them; shares the list with `useMachines`. */
export const useMachineEntries = () => machinesQuery((entries) => entries)

/**
 * More than this computer to choose from. Until the list arrives it counts as one machine, so
 * "this PC" never shows for a moment where there is nothing to pick.
 */
export const useHasOtherMachines = () => {
  const { data } = useMachines()
  return computed(() => (data.value?.length ?? 0) > 0)
}
/** One key for every view that lists a machine's accounts, so creating one refreshes them all. */
export const profilesKey = (machine: MaybeRefOrGetter<Machine>) =>
  ['agentd', 'profiles', machine] as const

export const fetchProfiles = async (machine: Machine) =>
  (await agentdService.ask<'profiles'>({ op: 'profiles' }, machine)).profiles

export const useProfiles = (machine: MaybeRefOrGetter<Machine> = null) =>
  useQuery({
    queryKey: profilesKey(machine),
    queryFn: () => fetchProfiles(toValue(machine))
  })

/** One key for the sidebar and the overview, so both read one cache and one invalidation. */
export const recentKey = (machine: MaybeRefOrGetter<Machine>) =>
  ['agentd', 'recent', machine, RECENT_LIMIT] as const

export const fetchRecent = async (machine: Machine) =>
  (await agentdService.ask<'recent'>({ op: 'recent', limit: RECENT_LIMIT }, machine)).sessions

export const useRecentSessions = (machine: MaybeRefOrGetter<Machine> = null) =>
  useQuery({
    queryKey: recentKey(machine),
    queryFn: () => fetchRecent(toValue(machine))
  })

/**
 * The recent sessions Bull lists, without the ones the user removed. "Continue an earlier one"
 * reads `useRecentSessions` instead: a removed session stays resumable there.
 */
export const useVisibleRecentSessions = (machine: MaybeRefOrGetter<Machine> = null) => {
  const query = useRecentSessions(machine)
  const hidden = useHiddenSessionsStore()
  const sessions = computed(() => hidden.visibleOf(toValue(machine), query.data.value ?? []))
  return { ...query, sessions }
}
