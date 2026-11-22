import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData } from '@tanstack/vue-query'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import { usePerMachineQueries } from '@/composables/usePerMachineQueries'
import type { MachineUsage, UsageReport } from '@/utils/usage'

/** Transcripts grow while Claude works; a minute old is current enough for a chart of days. */
const USAGE_STALE_TIME_MS = 60 * 1000
const USAGE_POLL_MS = 2 * 60 * 1000
/**
 * The first scan reads every transcript of the range, up to a year for the overview (gigabytes);
 * later ones only what grew.
 */
const USAGE_TIMEOUT_MS = 5 * 60 * 1000

export const usageKey = (machine: Machine, days: number) =>
  ['agentd', 'usage', machine, days] as const

const fetchUsage = async (days: number, machine: Machine): Promise<UsageReport> => {
  const answer = await agentdService.ask<'usage'>({ op: 'usage', days }, machine, USAGE_TIMEOUT_MS)
  // An agentd from before the activity grid sends tokens only.
  return { rows: answer.rows, tools: answer.tools ?? [], sessions: answer.sessions ?? [] }
}

/**
 * Tokens, tool calls and sessions per day for the last `days` days, from the transcripts of this
 * computer and every SSH machine. While a new range loads, the previous one stays on screen
 * (`isPlaceholder`); filter it through the current day axis before summing.
 */
export const useUsageHistory = (days: MaybeRefOrGetter<number>) => {
  const { answers, isPending, isError, isPlaceholder, loadingMachines, failedMachines, refetch } =
    usePerMachineQueries<UsageReport>((machine) => ({
      queryKey: usageKey(machine, toValue(days)),
      queryFn: () => fetchUsage(toValue(days), machine),
      staleTime: USAGE_STALE_TIME_MS,
      refetchInterval: USAGE_POLL_MS,
      placeholderData: keepPreviousData
    }))

  const usage = computed<MachineUsage[]>(() =>
    answers.value.map(({ machine, data }) => ({ machine, ...data }))
  )

  return { usage, isPending, isError, isPlaceholder, loadingMachines, failedMachines, refetch }
}
