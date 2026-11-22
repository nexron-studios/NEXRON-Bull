import type { Machine } from '@/api/services/agentd.service'
import type { ProfileProps, QuotaWindow } from '@/types/agentd.type'
import {
  defaultProfileOf,
  isOffered,
  loginStateOf,
  type AccountSettings,
  type LoginState
} from '@/utils/accountSettings'
import {
  accountKeyOf,
  planLabelOf,
  quotaOfProfile,
  windowOf,
  type MachineQuota
} from '@/utils/quota'

/** One account on the settings page (Figma "22"): who it is, its login and its quota. */
export interface AccountCardProps {
  machine: Machine
  profile: ProfileProps
  /** `accountKeyOf`, for its colour */
  accountKey: string
  /** `Max`, `Pro`; `null` until the quota answered */
  plan: string | null
  loginState: LoginState
  isOffered: boolean
  /** The account a new chat on this machine starts on */
  isDefault: boolean
  fiveHour: QuotaWindow | null
  week: QuotaWindow | null
}

/** The cards of one machine, in agentd's order (the folders sorted by name). */
export const accountCardsOf = (
  machine: Machine,
  profiles: ProfileProps[],
  quotas: MachineQuota[],
  settings: AccountSettings,
  isQuotaPending: boolean
): AccountCardProps[] => {
  const defaultDir = defaultProfileOf(settings, machine, profiles)?.dir
  return profiles.map((profile) => {
    const quota = quotaOfProfile(quotas, machine, profile.dir)
    return {
      machine,
      profile,
      accountKey: accountKeyOf({ email: profile.email, machine, profile: profile.dir }),
      plan: planLabelOf(quota?.plan ?? null),
      loginState: quota ? loginStateOf(quota) : isQuotaPending ? 'checking' : 'unknown',
      isOffered: isOffered(settings, machine, profile.dir),
      isDefault: profile.dir === defaultDir,
      fiveHour: quota ? windowOf(quota, 'five_hour') : null,
      week: quota ? windowOf(quota, 'seven_day') : null
    }
  })
}

/** The last part of a profile folder, as the card shows it: `.claude-office`. */
export const folderNameOf = (dir: string): string => dir.split(/[\\/]/).pop() ?? dir

/**
 * How the settings name an account: its login, because the folder name is `default` for
 * `~/.claude` and reads like the default for new chats. A folder without a login keeps its name.
 */
export const accountNameOf = (profile: ProfileProps): string => profile.email ?? profile.label

/**
 * agentd found no usable login in the folder, as after an aborted `claude /login`: it is not
 * "already logged in", and a new login with its name goes there. While the quota has not answered
 * (`checking`, `unknown`) nothing counts as logged out.
 */
export const isLoggedOut = (card: AccountCardProps): boolean => card.loginState === 'logged_out'

/** For screen readers and toasts: two folders logged into one account still differ by folder. */
export const accountLabelOf = (profile: ProfileProps): string =>
  `${accountNameOf(profile)} (${folderNameOf(profile.dir)})`

/** The id of a machine's heading on the accounts page, where focus goes after a removal. */
export const accountsHeadingIdOf = (machine: Machine): string => `accounts-${machine ?? 'this'}`
