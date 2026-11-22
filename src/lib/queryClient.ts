import { QueryClient } from '@tanstack/vue-query'
import { AgentdDisconnectedError } from '@/api/services/agentd.service'

/** Profiles and session lists change rarely while the app is open. */
export const DEFAULT_STALE_TIME_MS = 30 * 1000
/** TanStack Query's own default for other failures. */
const MAX_RETRIES = 3

/**
 * A machine whose connection ended without an answer is unreachable: each retry would cost
 * another SSH connect timeout before its view shows "not reachable" and its own retry button.
 */
export const shouldRetry = (failureCount: number, error: Error): boolean =>
  !(error instanceof AgentdDisconnectedError) && failureCount < MAX_RETRIES

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: DEFAULT_STALE_TIME_MS, retry: shouldRetry } }
})
