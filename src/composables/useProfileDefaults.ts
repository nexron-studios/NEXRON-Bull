import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { agentdService, type Machine } from '@/api/services/agentd.service'

/** settings.json changes when the user edits it by hand; a minute late is soon enough. */
const DEFAULTS_STALE_TIME_MS = 60 * 1000
/** An offline machine never answers; the labels then say "the account's default" without a name. */
const DEFAULTS_TIMEOUT_MS = 5 * 1000

/**
 * What an account starts new sessions with (model, effort, mode from its settings.json). An
 * agentd from before the op answers with an error: `data` stays empty and nothing is named.
 */
export const useProfileDefaults = (
  machine: MaybeRefOrGetter<Machine>,
  profile: MaybeRefOrGetter<string | null>,
  isEnabled: MaybeRefOrGetter<boolean> = true
) =>
  useQuery({
    queryKey: ['agentd', 'profile_defaults', machine, profile],
    queryFn: async () =>
      (
        await agentdService.ask<'profile_defaults'>(
          { op: 'profile_defaults', profile: toValue(profile) },
          toValue(machine),
          DEFAULTS_TIMEOUT_MS
        )
      ).defaults,
    enabled: computed(() => toValue(isEnabled)),
    staleTime: DEFAULTS_STALE_TIME_MS,
    retry: false
  })
