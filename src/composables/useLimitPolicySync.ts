import { onScopeDispose } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { useQueryClient } from '@tanstack/vue-query'
import {
  AgentdDisconnectedError,
  AgentdTimeoutError,
  agentdService,
  type Machine
} from '@/api/services/agentd.service'
import { machineService } from '@/api/services/machine.service'
import { MACHINES_KEY } from '@/composables/useAgentdCatalog'
import { useLimitPolicyStore } from '@/stores/limitPolicy'

/** Clicking through the settings sends one push, not one per switch. */
const PUSH_DEBOUNCE_MS = 600
/** An offline host never answers; its push is tried again once it does. */
const PUSH_TIMEOUT_MS = 20 * 1000
const AGENTD_QUERY_ROOT = 'agentd'

/**
 * Hands the limit policy to the agentd of this computer and of every SSH host: at app start,
 * shortly after each change, and to a host whose push did not arrive (offline, connection lost)
 * as soon as that host answers any other request again. agentd keeps the policy on disk, so a
 * host that restarts still has it. A failed push is only logged: an agentd without the op
 * answers an error, and the limits then simply do not apply there yet.
 */
export const useLimitPolicySync = () => {
  const store = useLimitPolicyStore()
  const queryClient = useQueryClient()
  /** Hosts that may hold an older policy than the app */
  const unsynced = new Set<Machine>()

  const push = async (machine: Machine) => {
    try {
      await agentdService.ask<'limits_set'>(
        { op: 'set_limits', policy: store.policy },
        machine,
        PUSH_TIMEOUT_MS
      )
      unsynced.delete(machine)
    } catch (error) {
      // An agentd that answered with an error has no use for the same policy again; a host that
      // did not answer, or could not be reached, gets it once it is back.
      if (error instanceof AgentdTimeoutError || error instanceof AgentdDisconnectedError)
        unsynced.add(machine)
      console.warn('limits.push_failed', { machine })
    }
  }

  const pushAll = async () => {
    // The list the views already hold; a list that cannot be read leaves this PC to push to.
    const remote = await queryClient
      .ensureQueryData({ queryKey: MACHINES_KEY, queryFn: machineService.list })
      .catch(() => [])
    await Promise.all([null, ...remote.map((entry) => entry.name)].map(push))
  }

  // The app learns that a host is back from the next answer it gets from there: the quota and
  // profile polls ask every host anyway, so no extra SSH round trip goes to an offline one.
  const stopWatchingQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return
    const [root, , machine] = event.query.queryKey as readonly unknown[]
    if (root !== AGENTD_QUERY_ROOT || (machine !== null && typeof machine !== 'string')) return
    if (!unsynced.delete(machine)) return
    void push(machine)
  })
  const stopWatchingEvents = agentdService.onEvent((event) => {
    if (event.type === 'disconnected') unsynced.add(event.machine)
  })

  watchDebounced(() => store.policy, pushAll, { debounce: PUSH_DEBOUNCE_MS, deep: true })
  void pushAll()

  onScopeDispose(() => {
    stopWatchingQueries()
    stopWatchingEvents()
  })
}
