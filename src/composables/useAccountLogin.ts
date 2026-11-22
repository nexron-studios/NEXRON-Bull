import { useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import type { Machine } from '@/api/services/agentd.service'
import { profilesKey } from '@/composables/useAgentdCatalog'
import { quotaKey } from '@/composables/useQuota'
import { useTerminalRequestStore } from '@/stores/terminalRequests'
import type { ProfileProps } from '@/types/agentd.type'
import { loginRequestOf } from '@/utils/accountLogin'

/** Logging an account in through a terminal in Bull, and picking up the result afterwards. */
export const useAccountLogin = () => {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const terminals = useTerminalRequestStore()

  const openTerminal = (machine: Machine, profile: ProfileProps) =>
    terminals.request(
      loginRequestOf(machine, profile, t('settings.login.title', { account: profile.label }))
    )

  /**
   * Reads the machine's accounts and logins again. Not a forced quota round: agentd answers a new
   * login from its credentials file and only asks Anthropic on its own schedule.
   */
  const refreshMachine = (machine: Machine) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: profilesKey(machine) }),
      queryClient.invalidateQueries({ queryKey: quotaKey(machine) })
    ])

  return { openTerminal, refreshMachine }
}
