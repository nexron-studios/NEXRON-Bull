import type { Machine } from '@/api/services/agentd.service'
import type { ProfileProps, QuotaProblem } from '@/types/agentd.type'
import { accountKeyOf, accountToneOf, type AccountTone } from '@/utils/quota'

/** What the user set per account in the settings; the accounts themselves live in agentd. */
export interface AccountSettings {
  /** `profileKeyOf` of the accounts Bull does not offer for new chats and the account switch */
  hidden: string[]
  /** The profile folder a new chat starts on, per machine (`machineKeyOf`) */
  defaults: Record<string, string>
  /** A colour picked for an account, by `accountKeyOf`; the others keep their hashed one */
  tones: Record<string, AccountTone>
}

export const EMPTY_ACCOUNT_SETTINGS: AccountSettings = { hidden: [], defaults: {}, tones: {} }

/** Keeps an older or partly written entry usable: every field present. */
export const withAccountSettingDefaults = (
  stored: Partial<AccountSettings> | null | undefined
): AccountSettings => ({ ...EMPTY_ACCOUNT_SETTINGS, ...stored })

export const machineKeyOf = (machine: Machine): string => machine ?? ''

/** One profile on one machine: `default` here and `default` on a server are two accounts. */
export const profileKeyOf = (machine: Machine, dir: string): string =>
  `${machineKeyOf(machine)}|${dir}`

export const isOffered = (settings: AccountSettings, machine: Machine, dir: string): boolean =>
  !settings.hidden.includes(profileKeyOf(machine, dir))

/** The accounts of one machine that new chats and the account switch may use. */
export const offeredProfilesOf = (
  settings: AccountSettings,
  machine: Machine,
  profiles: ProfileProps[]
): ProfileProps[] => profiles.filter((profile) => isOffered(settings, machine, profile.dir))

/**
 * The account a new chat on this machine starts on: the chosen default while it is offered, else
 * the first offered one that has logged in once (a fresh folder has no email yet), else the first
 * offered one; `null` when every account there is switched off.
 */
export const defaultProfileOf = (
  settings: AccountSettings,
  machine: Machine,
  profiles: ProfileProps[]
): ProfileProps | null => {
  const offered = offeredProfilesOf(settings, machine, profiles)
  const chosen = settings.defaults[machineKeyOf(machine)]
  return (
    offered.find((profile) => profile.dir === chosen) ??
    offered.find((profile) => profile.email !== null) ??
    offered[0] ??
    null
  )
}

/** Switching an account off also drops it as the default: a default nobody may use means nothing. */
export const withOffered = (
  settings: AccountSettings,
  machine: Machine,
  dir: string,
  isWanted: boolean
): AccountSettings => {
  const key = profileKeyOf(machine, dir)
  const hidden = settings.hidden.filter((entry) => entry !== key)
  if (isWanted) return { ...settings, hidden }
  const defaults = { ...settings.defaults }
  if (defaults[machineKeyOf(machine)] === dir) delete defaults[machineKeyOf(machine)]
  return { ...settings, hidden: [...hidden, key], defaults }
}

/** The default is one per machine; choosing it also offers the account again. */
export const withDefault = (
  settings: AccountSettings,
  machine: Machine,
  dir: string
): AccountSettings => ({
  ...withOffered(settings, machine, dir, true),
  defaults: { ...settings.defaults, [machineKeyOf(machine)]: dir }
})

export const withTone = (
  settings: AccountSettings,
  accountKey: string,
  tone: AccountTone
): AccountSettings => ({ ...settings, tones: { ...settings.tones, [accountKey]: tone } })

export const toneOf = (settings: AccountSettings, accountKey: string): AccountTone =>
  settings.tones[accountKey] ?? accountToneOf(accountKey)

/**
 * A new account has no login yet, so its colour is stored under its folder; once it has logged in,
 * its key is the email (`accountKeyOf`) and the colour moves there, unless that login has one.
 */
export const withAdoptedTones = (
  settings: AccountSettings,
  machine: Machine,
  profiles: ProfileProps[]
): AccountSettings => {
  const moves = profiles.flatMap((profile) => {
    if (!profile.email || profile.email in settings.tones) return []
    const tone = settings.tones[accountKeyOf({ email: null, machine, profile: profile.dir })]
    return tone ? [[profile.email, tone] as const] : []
  })
  if (!moves.length) return settings
  return { ...settings, tones: { ...settings.tones, ...Object.fromEntries(moves) } }
}

/** `checking` while the quota has not answered, `unknown` when it cannot (machine offline). */
export const loginStateList = ['logged_in', 'logged_out', 'expired', 'checking', 'unknown'] as const
export type LoginState = (typeof loginStateList)[number]

/**
 * Whether an account is logged in, from its quota answer: a missing or ended login is a quota
 * problem in agentd; any other problem (429, offline) still means a login exists.
 */
export const loginStateOf = (quota: { problem: QuotaProblem | null }): LoginState => {
  switch (quota.problem) {
    case 'no_login':
    case 'logged_out':
      return 'logged_out'
    case 'expired':
      return 'expired'
    case null:
    case 'rate_limited':
    case 'unreachable':
    case 'bad_answer':
    case 'stale':
      return 'logged_in'
    default: {
      const unhandled: never = quota.problem
      throw new Error(`Unhandled quota problem: ${unhandled}`)
    }
  }
}

/** Folder names agentd accepts for a new account (`agentd/src/profile_setup.rs`). */
export const ACCOUNT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/
const RESERVED_ACCOUNT_NAME = 'default'

export const accountNameProblemList = ['empty', 'invalid', 'taken'] as const
export type AccountNameProblem = (typeof accountNameProblemList)[number]

/** Why a name cannot become a new account on that machine; `null` when it can. */
export const accountNameProblemOf = (name: string, taken: string[]): AccountNameProblem | null => {
  if (!name) return 'empty'
  if (!ACCOUNT_NAME_PATTERN.test(name) || name === RESERVED_ACCOUNT_NAME) return 'invalid'
  // Windows folder names ignore case: `.claude-Work` already takes `work`.
  return taken.some((label) => label.toLowerCase() === name) ? 'taken' : null
}

const PROFILE_PREFIX = '.claude-'

const separatorOf = (path: string): string => (path.includes('\\') ? '\\' : '/')

/** The home folder a profile folder sits in: where the login terminal opens. */
export const homeOfProfileDir = (dir: string): string =>
  dir.slice(0, dir.lastIndexOf(separatorOf(dir)))

/**
 * Where agentd will put a new account: next to the machine's other profile folders, with their
 * separator. `null` while no profile there tells the home folder.
 */
export const newProfileDirOf = (profiles: ProfileProps[], name: string): string | null => {
  const known = profiles[0]?.dir
  if (!known) return null
  return `${homeOfProfileDir(known)}${separatorOf(known)}${PROFILE_PREFIX}${name}`
}
