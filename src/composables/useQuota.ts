import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import { usePerMachineQueries } from '@/composables/usePerMachineQueries'
import type { AccountQuotaProps } from '@/types/agentd.type'
import { useAccountSettingsStore } from '@/stores/accountSettings'
import { mergeQuotas, offeredAnswersOf, type MachineQuota } from '@/utils/quota'

/** agentd asks Anthropic at most this often per account (`agentd/src/quota.rs`). */
export const QUOTA_POLL_MS = 90 * 1000
/** Fresh enough to skip a refetch when a second view mounts right after the first. */
const QUOTA_STALE_TIME_MS = 60 * 1000
/**
 * A round asks all accounts at once and curl gives up after 10 s, but logins shared by two
 * profiles are tried one after the other, and a request may first wait for a running round.
 */
const QUOTA_TIMEOUT_MS = 60 * 1000

export const quotaKey = (machine: Machine) => ['agentd', 'quota', machine] as const

const fetchQuota = async (machine: Machine, force: boolean): Promise<AccountQuotaProps[]> =>
  (await agentdService.ask<'quota'>({ op: 'quota', force }, machine, QUOTA_TIMEOUT_MS)).accounts

/**
 * Plan quota of every Claude account on this computer and the SSH machines, polled every 90 s
 * while a view uses it. `accounts` has one entry per account Bull offers (shared logins folded,
 * removed ones left out), `profiles` one per profile and machine, for a tab's own account
 * (`quotaOfProfile`). With `isEnabled` false it only reads what another view fetched.
 */
export const useQuota = (isEnabled: MaybeRefOrGetter<boolean> = true) => {
  const queryClient = useQueryClient()
  const accountSettings = useAccountSettingsStore()
  const { machines, answers, isPending, isError, isFetching, failedMachines } =
    usePerMachineQueries((machine) => ({
      queryKey: quotaKey(machine),
      queryFn: () => fetchQuota(machine, false),
      staleTime: QUOTA_STALE_TIME_MS,
      refetchInterval: QUOTA_POLL_MS,
      enabled: toValue(isEnabled)
    }))

  const byMachine = computed(() =>
    answers.value.map(({ machine, data }) => ({ machine, accounts: data }))
  )
  const profiles = computed<MachineQuota[]>(() =>
    byMachine.value.flatMap(({ machine, accounts }) => accounts.map((a) => ({ ...a, machine })))
  )
  const accounts = computed(() =>
    mergeQuotas(offeredAnswersOf(byMachine.value, accountSettings.isOfferedOn))
  )

  /**
   * Asks Anthropic again now (agentd allows it every 15 s), on every machine. A machine that does
   * not answer keeps its error state; the others still update.
   */
  const refresh = () =>
    Promise.allSettled(
      machines.value.map((machine) =>
        queryClient.fetchQuery({
          queryKey: quotaKey(machine),
          queryFn: () => fetchQuota(machine, true),
          staleTime: 0
        })
      )
    )

  return { accounts, profiles, isPending, isError, isFetching, failedMachines, refresh }
}
