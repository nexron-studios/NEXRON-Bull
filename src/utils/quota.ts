import type {
  AccountQuotaProps,
  QuotaProblem,
  QuotaSource,
  QuotaWindow,
  QuotaWindowKey
} from '@/types/agentd.type'
import { fnv1aOf } from '@/utils/hash'
import { leftPercentOf } from '@/utils/percent'

/** An account's quota and the machine that answered for it; `null` is this computer. */
export interface MachineQuota extends AccountQuotaProps {
  machine: string | null
}

export const meterLevelList = ['normal', 'high', 'full'] as const
export type MeterLevel = (typeof meterLevelList)[number]

const HIGH_PERCENT = 80
const FULL_PERCENT = 95
const MS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
/**
 * TokenScope asks Anthropic every 60 s and now and then gets a 429. Its numbers stay good for a
 * few minutes; only when they are this old is its last failure worth a warning.
 */
const SCOPE_PROBLEM_GRACE_MS = 5 * MS_PER_MINUTE
/** Failures TokenScope gets past on its own; a login problem is shown at once. */
const PASSING_SCOPE_PROBLEMS: readonly QuotaProblem[] = ['rate_limited', 'unreachable', 'stale']

export interface ResetIn {
  days: number
  hours: number
  minutes: number
}

const hasNumbers = (account: AccountQuotaProps): boolean => account.windows.length > 0

/**
 * Only the profiles Bull offers. Filtered before `mergeQuotas`, so a login shared by a removed
 * and an offered profile stays listed under the offered one.
 */
export const offeredAnswersOf = (
  answers: { machine: string | null; accounts: AccountQuotaProps[] }[],
  isOffered: (machine: string | null, dir: string) => boolean
): { machine: string | null; accounts: AccountQuotaProps[] }[] =>
  answers.map(({ machine, accounts }) => ({
    machine,
    accounts: accounts.filter((account) => isOffered(machine, account.profile))
  }))

type QuotaKeyOf = (account: AccountQuotaProps, machine: string | null) => string

const profileKeyOf = (account: AccountQuotaProps, machine: string | null): string =>
  `${machine ?? ''}\u0000${account.profile}`

/** Two profiles (or two machines) logged into the same email share one quota. */
export const emailKeyOf: QuotaKeyOf = (account, machine) =>
  account.email ?? profileKeyOf(account, machine)

/** Same login under the same profile name on two machines is one row; other profiles stay apart. */
export const loginKeyOf: QuotaKeyOf = (account, machine) =>
  account.email ? `${account.email}\u0000${account.label}` : profileKeyOf(account, machine)

/**
 * One entry per key across machines, by default one per Claude account (`emailKeyOf`). The first
 * with numbers wins, this computer first.
 */
export const mergeQuotas = (
  answers: { machine: string | null; accounts: AccountQuotaProps[] }[],
  keyOf: QuotaKeyOf = emailKeyOf
): MachineQuota[] => {
  const byKey = new Map<string, MachineQuota>()
  for (const { machine, accounts } of answers) {
    for (const account of accounts) {
      const key = keyOf(account, machine)
      const known = byKey.get(key)
      if (known && (hasNumbers(known) || !hasNumbers(account))) continue
      byKey.set(key, { ...account, machine })
    }
  }
  return [...byKey.values()]
}

/** The quota of the profile a tab runs on; `null` profile is the default `~/.claude`. */
export const quotaOfProfile = (
  quotas: MachineQuota[],
  machine: string | null,
  profile: string | null
): MachineQuota | null =>
  quotas.find(
    (quota) =>
      quota.machine === machine &&
      (profile === null ? quota.label === 'default' : quota.profile === profile)
  ) ?? null

export const windowOf = (account: AccountQuotaProps, key: QuotaWindowKey): QuotaWindow | null =>
  account.windows.find((window) => window.key === key) ?? null

/** How a meter looks at each level: brand while there is room, then warning, then critical. */
export const METER_LEVEL_CLASS: Record<MeterLevel, { fill: string; stroke: string; text: string }> =
  {
    normal: { fill: 'bg-brand', stroke: 'stroke-brand', text: 'text-muted-foreground' },
    high: { fill: 'bg-warning', stroke: 'stroke-warning', text: 'text-warning' },
    full: { fill: 'bg-critical', stroke: 'stroke-critical', text: 'text-critical' }
  }

export const meterLevelOf = (percent: number): MeterLevel => {
  if (percent >= FULL_PERCENT) return 'full'
  if (percent >= HIGH_PERCENT) return 'high'
  return 'normal'
}

/** Time left until `resetsAt`; `null` without a time or once it has passed. */
export const resetInOf = (resetsAt: string | null, now: number): ResetIn | null => {
  if (!resetsAt) return null
  const left = Date.parse(resetsAt) - now
  if (!Number.isFinite(left) || left <= 0) return null
  const totalMinutes = Math.ceil(left / MS_PER_MINUTE)
  return {
    days: Math.floor(totalMinutes / (MINUTES_PER_HOUR * HOURS_PER_DAY)),
    hours: Math.floor(totalMinutes / MINUTES_PER_HOUR) % HOURS_PER_DAY,
    minutes: totalMinutes % MINUTES_PER_HOUR
  }
}

/** The problem worth showing: a passing TokenScope failure over fresh numbers is none. */
export const shownProblemOf = (account: AccountQuotaProps, now: number): QuotaProblem | null => {
  const { problem, source, fetched_ms } = account
  if (!problem) return null
  const isPassing = source === 'tokenscope' && PASSING_SCOPE_PROBLEMS.includes(problem)
  return isPassing && now - fetched_ms < SCOPE_PROBLEM_GRACE_MS ? null : problem
}

/**
 * The i18n key of a quota problem. From TokenScope it is TokenScope's report, not agentd's own
 * request, so the text says so and promises no retry time.
 */
export const problemKeyOf = (problem: QuotaProblem, source?: QuotaSource): string =>
  source === 'tokenscope' ? `usage.scope_problems.${problem}` : `usage.problems.${problem}`

/** `max` → `Max`; the plan names are product names and stay untranslated. */
export const planLabelOf = (plan: string | null): string | null =>
  plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : null

/** Pill tones of the plans (`--plan-*` in tokens.css); a plan without its own, like free, is neutral. */
export const planToneList = ['pro', 'max', 'neutral'] as const
export type PlanTone = (typeof planToneList)[number]

export const planToneOf = (plan: string): PlanTone => {
  const tone = plan.toLowerCase()
  return tone === 'pro' || tone === 'max' ? tone : 'neutral'
}

/** Dot colours of the accounts (`--account-*` in tokens.css); more accounts share them in turn. */
export const accountToneList = ['a', 'b', 'c', 'd'] as const
export type AccountTone = (typeof accountToneList)[number]

export const ACCOUNT_TONE_CLASS: Record<AccountTone, string> = {
  a: 'bg-account-a',
  b: 'bg-account-b',
  c: 'bg-account-c',
  d: 'bg-account-d'
}

/**
 * Who an account is: its login email when known, so two profiles or machines on one login are one
 * account; else the profile on its machine, so `default` here and `default` on a server differ.
 */
export const accountKeyOf = (account: {
  email: string | null
  machine: string | null
  profile: string
}): string => account.email ?? `${account.machine ?? ''}:${account.profile}`

/**
 * The colour of an account's dot, from its key alone: the same in every view, on every machine and
 * whichever quota answers have arrived. Five or more accounts share colours.
 */
export const accountToneOf = (accountKey: string): AccountTone =>
  accountToneList[fnv1aOf(accountKey) % accountToneList.length]

/** What is left of the 5-hour window, 0…100; `null` without numbers for it. */
export const freePercentOf = (account: AccountQuotaProps): number | null => {
  const window = windowOf(account, 'five_hour')
  return window ? Math.round(leftPercentOf(window.used_percent)) : null
}
