import { computed, watch } from 'vue'
import type { Machine } from '@/api/services/agentd.service'
import { fetchProfiles, profilesKey } from '@/composables/useAgentdCatalog'
import { usePerMachineQueries } from '@/composables/usePerMachineQueries'
import { useQuota } from '@/composables/useQuota'
import { useAccountSettingsStore } from '@/stores/accountSettings'
import type { ProfileProps } from '@/types/agentd.type'
import { accountCardsOf, type AccountCardProps } from '@/utils/accountCards'

/** A new folder or a finished login shows up without a reload while the page is open. */
const PROFILES_POLL_MS = 15 * 1000
const FAILED_POLL_MS = 60 * 1000
const PROFILES_STALE_TIME_MS = 10 * 1000

export const machineStateList = ['loading', 'failed', 'ready'] as const
export type MachineState = (typeof machineStateList)[number]

export interface MachineAccounts {
  machine: Machine
  state: MachineState
  profiles: ProfileProps[]
  cards: AccountCardProps[]
  /** The cards Bull offers, the ones the accounts page lists */
  offeredCards: AccountCardProps[]
  /** When the machine last listed its accounts (ms); `null` while it never answered */
  answeredAt: number | null
}

/**
 * The accounts of this computer and every SSH host, each machine on its own: an offline host
 * shows its note while the others are listed. Shares the profile cache with the account switch
 * and the new-session dialog.
 */
export const useSettingsAccounts = () => {
  const accountSettings = useAccountSettingsStore()
  const quota = useQuota()
  const perMachine = usePerMachineQueries((machine) => ({
    queryKey: profilesKey(machine),
    queryFn: () => fetchProfiles(machine),
    staleTime: PROFILES_STALE_TIME_MS,
    // An offline host is asked once a minute instead of every 15 s: each try waits out the SSH
    // timeout. The card offers no retry button; it comes back by itself once the host answers.
    refetchInterval: (query) => (query.state.status === 'error' ? FAILED_POLL_MS : PROFILES_POLL_MS)
  }))

  const stateOf = (machine: Machine): MachineState => {
    const isLoading =
      machine === null
        ? perMachine.isPending.value
        : perMachine.loadingMachines.value.includes(machine)
    const isFailed =
      machine === null
        ? perMachine.isError.value
        : perMachine.failedMachines.value.includes(machine)
    if (isFailed) return 'failed'
    return isLoading ? 'loading' : 'ready'
  }

  // A machine's quota answers for all its accounts at once; until then their login is open.
  const isQuotaPendingOn = (machine: Machine) =>
    !quota.profiles.value.some((answer) => answer.machine === machine) &&
    (machine === null ? !quota.isError.value : !quota.failedMachines.value.includes(machine))

  const groups = computed<MachineAccounts[]>(() =>
    perMachine.machines.value.map((machine) => {
      const profiles =
        perMachine.answers.value.find((answer) => answer.machine === machine)?.data ?? []
      const cards = accountCardsOf(
        machine,
        profiles,
        quota.profiles.value,
        accountSettings.settings,
        isQuotaPendingOn(machine)
      )
      return {
        machine,
        // A machine that answered once keeps its accounts while a later poll fails.
        state: profiles.length ? 'ready' : stateOf(machine),
        profiles,
        cards,
        offeredCards: cards.filter((card) => card.isOffered),
        answeredAt: perMachine.answeredAt.value.get(machine) ?? null
      }
    })
  )
  const offeredCount = computed(() =>
    groups.value.reduce((sum, group) => sum + group.offeredCards.length, 0)
  )

  // A colour picked for a new account moves to its login once it has one.
  watch(
    () => perMachine.answers.value,
    (answers) => answers.forEach(({ machine, data }) => accountSettings.adoptTones(machine, data)),
    { immediate: true }
  )

  return {
    groups,
    offeredCount,
    machines: perMachine.machines,
    refetch: perMachine.refetch,
    refreshQuota: quota.refresh
  }
}
