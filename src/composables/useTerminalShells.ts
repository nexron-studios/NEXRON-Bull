import { useQuery } from '@tanstack/vue-query'
import { terminalService } from '@/api/services/terminal.service'

/** Installing a shell while Bull runs is rare; a restart picks it up. */
const SHELLS_STALE_TIME_MS = Number.POSITIVE_INFINITY

/** The shells installed on this machine, for picking one. */
export const useTerminalShells = () =>
  useQuery({
    queryKey: ['terminal', 'shells'],
    queryFn: terminalService.shells,
    staleTime: SHELLS_STALE_TIME_MS
  })
