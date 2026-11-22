import { computed, reactive, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { AgentdDisconnectedError, agentdService, type Machine } from '@/api/services/agentd.service'

/** Claude may switch branches while it works; agentd only reads a file, so asking is cheap. */
const BRANCH_POLL_MS = 30 * 1000
/** An offline machine never answers; the panel then shows the branch as unknown. */
const BRANCH_TIMEOUT_MS = 5 * 1000

// Machines that did not answer the op: an agentd from before it answers at once with an error
// ("unknown variant"), an offline one not at all. Neither changes until the connection drops, so
// asking again every 30 s would only repeat the error. A new connection may be a new agentd.
const silentMachines = reactive(new Set<Machine>())
let isListening = false
const forgetOnReconnect = () => {
  if (isListening) return
  isListening = true
  agentdService.onEvent((event) => {
    if (event.type === 'disconnected') silentMachines.delete(event.machine)
  })
}

/**
 * The git branch checked out in a tab's folder, from the machine the tab runs on. `isUnknown`:
 * that machine gave no answer, so there is nothing to wait for.
 */
export const useGitBranch = (cwd: MaybeRefOrGetter<string>, machine: MaybeRefOrGetter<Machine>) => {
  forgetOnReconnect()
  const isUnknown = computed(() => silentMachines.has(toValue(machine)))
  const query = useQuery({
    queryKey: ['agentd', 'branch', machine, cwd],
    queryFn: async () => {
      const on = toValue(machine)
      try {
        return (
          await agentdService.ask<'branch'>(
            { op: 'branch', cwd: toValue(cwd) },
            on,
            BRANCH_TIMEOUT_MS
          )
        ).branch
      } catch (error) {
        // A lost connection says nothing about the agentd behind the next one, and its
        // `disconnected` event has already gone by: marking it now would stick.
        if (!(error instanceof AgentdDisconnectedError)) silentMachines.add(on)
        throw error
      }
    },
    enabled: computed(() => !isUnknown.value),
    refetchInterval: BRANCH_POLL_MS,
    retry: false
  })
  return { data: query.data, isPending: query.isPending, isUnknown }
}
