import { describe, expect, it } from 'vitest'
import {
  accountKeyOf,
  accountToneOf,
  freePercentOf,
  loginQuotasOf,
  mergeQuotas,
  offeredAnswersOf,
  meterLevelOf,
  planLabelOf,
  planToneOf,
  problemKeyOf,
  quotaOfProfile,
  resetInOf,
  shownProblemOf,
  windowOf
} from '../quota'
import type { AccountQuotaProps } from '@/types/agentd.type'

const account = (
  label: string,
  email: string | null,
  percents: number[] = [42, 63]
): AccountQuotaProps => ({
  profile: `C:\\Users\\j\\.claude-${label}`,
  label,
  email,
  plan: 'max',
  windows: percents.map((used, index) => ({
    key: index === 0 ? 'five_hour' : 'seven_day',
    used_percent: used,
    resets_at: '2026-11-15T20:00:00Z'
  })),
  fetched_ms: 1,
  problem: null
})

describe('offeredAnswersOf', () => {
  it('should drop a profile removed from Bull but keep its shared login on an offered one', () => {
    const removed = new Set([
      `\u0000${account('default', 'a@x').profile}`,
      `\u0000${account('testuser', null).profile}`
    ])
    const offered = offeredAnswersOf(
      [
        {
          machine: null,
          accounts: [account('default', 'a@x'), account('gmail', 'a@x'), account('testuser', null)]
        }
      ],
      (machine, dir) => !removed.has(`${machine ?? ''}\u0000${dir}`)
    )
    expect(mergeQuotas(offered).map((q) => q.label)).toEqual(['gmail'])
  })
})

describe('loginQuotasOf', () => {
  it('should show two profiles on one email as one account that names both', () => {
    const logins = loginQuotasOf([
      { machine: null, accounts: [account('default', 'a@x'), account('work', 'a@x')] },
      { machine: 'server', accounts: [account('default', 'a@x'), account('home', 'b@x')] }
    ])
    expect(logins.map((login) => [login.machine, login.names, login.members])).toEqual([
      [
        null,
        'default · work',
        [
          { machine: null, label: 'default' },
          { machine: null, label: 'work' },
          { machine: 'server', label: 'default' }
        ]
      ],
      ['server', 'home', [{ machine: 'server', label: 'home' }]]
    ])
  })

  it('should keep profiles without email apart per machine', () => {
    const logins = loginQuotasOf([
      { machine: null, accounts: [account('default', null)] },
      { machine: 'server', accounts: [account('default', null)] }
    ])
    expect(logins.map((login) => [login.machine, login.names])).toEqual([
      [null, 'default'],
      ['server', 'default']
    ])
  })
})

describe('mergeQuotas', () => {
  it('should fold profiles and machines logged into one email, this computer first', () => {
    const merged = mergeQuotas([
      { machine: null, accounts: [account('work', 'a@x'), account('mail', 'a@x')] },
      { machine: 'server', accounts: [account('default', 'a@x'), account('home', 'b@x')] }
    ])
    expect(merged.map((q) => [q.machine, q.label])).toEqual([
      [null, 'work'],
      ['server', 'home']
    ])
  })

  it('should prefer an answer with numbers over one without', () => {
    const merged = mergeQuotas([
      { machine: null, accounts: [{ ...account('work', 'a@x', []), problem: 'expired' }] },
      { machine: 'server', accounts: [account('default', 'a@x')] }
    ])
    expect(merged.map((q) => [q.machine, q.label])).toEqual([['server', 'default']])
  })

  it('should keep accounts without email apart per machine', () => {
    const merged = mergeQuotas([
      { machine: null, accounts: [account('default', null)] },
      { machine: 'server', accounts: [account('default', null)] }
    ])
    expect(merged.length).toBe(2)
  })
})

describe('quotaOfProfile', () => {
  it('should find the default profile of a tab without profile folder', () => {
    const quotas = [{ ...account('default', 'a@x'), machine: null }]
    expect(quotaOfProfile(quotas, null, null)?.label).toBe('default')
  })

  it('should match the profile folder on the same machine only', () => {
    const quotas = [{ ...account('work', 'a@x'), machine: 'server' }]
    expect(quotaOfProfile(quotas, null, 'C:\\Users\\j\\.claude-work')).toBe(null)
  })
})

describe('windowOf', () => {
  it('should pick a window by key', () => {
    expect(windowOf(account('work', null), 'seven_day')?.used_percent).toBe(63)
  })
})

describe('shownProblemOf', () => {
  const FETCHED_MS = Date.parse('2026-11-18T00:26:00Z')
  const MINUTE_MS = 60_000
  const scoped = (problem: AccountQuotaProps['problem']): AccountQuotaProps => ({
    ...account('work', null),
    fetched_ms: FETCHED_MS,
    problem,
    source: 'tokenscope'
  })

  it('should hide a TokenScope rate limit while its numbers are younger than five minutes', () => {
    expect(shownProblemOf(scoped('rate_limited'), FETCHED_MS + 4 * MINUTE_MS)).toBe(null)
  })

  it('should show a TokenScope rate limit once its numbers are five minutes old', () => {
    expect(shownProblemOf(scoped('rate_limited'), FETCHED_MS + 5 * MINUTE_MS)).toBe('rate_limited')
  })

  it('should hide an unreachable or stale TokenScope while its numbers are fresh', () => {
    expect(shownProblemOf(scoped('unreachable'), FETCHED_MS + MINUTE_MS)).toBe(null)
    expect(shownProblemOf(scoped('stale'), FETCHED_MS + MINUTE_MS)).toBe(null)
  })

  it('should show a TokenScope rate limit at once when nothing was ever fetched', () => {
    expect(shownProblemOf({ ...scoped('rate_limited'), fetched_ms: 0 }, FETCHED_MS)).toBe(
      'rate_limited'
    )
  })

  it('should show an expired TokenScope login at once', () => {
    expect(shownProblemOf(scoped('expired'), FETCHED_MS)).toBe('expired')
  })

  it('should show a rate limit of the own request at once', () => {
    const own = { ...scoped('rate_limited'), source: 'anthropic' as const }
    expect(shownProblemOf(own, FETCHED_MS)).toBe('rate_limited')
  })
})

describe('meterLevelOf', () => {
  it('should turn high from 80 % and full from 95 %', () => {
    expect([meterLevelOf(79.9), meterLevelOf(80), meterLevelOf(96)]).toEqual([
      'normal',
      'high',
      'full'
    ])
  })
})

describe('resetInOf', () => {
  const now = Date.parse('2026-11-15T17:46:00Z')

  it('should split the time left into days, hours and minutes', () => {
    expect(resetInOf('2026-11-15T20:00:00Z', now)).toEqual({ days: 0, hours: 2, minutes: 14 })
    expect(resetInOf('2026-11-18T19:46:00Z', now)).toEqual({ days: 3, hours: 2, minutes: 0 })
  })

  it('should give nothing without a time or once it passed', () => {
    expect([resetInOf(null, now), resetInOf('2026-11-15T17:00:00Z', now)]).toEqual([null, null])
  })
})

describe('planLabelOf', () => {
  it('should capitalise the plan name', () => {
    expect([planLabelOf('max'), planLabelOf(null)]).toEqual(['Max', null])
  })

  it('should show a plan Bull does not know by its own name', () => {
    expect(planLabelOf('team')).toBe('Team')
  })
})

describe('planToneOf', () => {
  it('should give Pro, Max and Ultra their own tone, whatever the case', () => {
    expect([planToneOf('Pro'), planToneOf('max'), planToneOf('Ultra')]).toEqual([
      'pro',
      'max',
      'ultra'
    ])
  })

  it('should keep a plan without its own colour neutral', () => {
    expect([planToneOf('Free'), planToneOf('neutral')]).toEqual(['neutral', 'neutral'])
  })
})

describe('accountKeyOf', () => {
  it('should key an account by its login, else by profile and machine', () => {
    expect(accountKeyOf({ email: 'a@example.com', machine: 'server', profile: '/p' })).toBe(
      'a@example.com'
    )
    expect(accountKeyOf({ email: null, machine: null, profile: '/home/j/.claude' })).toBe(
      ':/home/j/.claude'
    )
    expect(accountKeyOf({ email: null, machine: 'server', profile: '/home/j/.claude' })).toBe(
      'server:/home/j/.claude'
    )
  })
})

describe('accountToneOf', () => {
  it('should give an account the same colour from its key alone', () => {
    expect(accountToneOf('work@example.com')).toBe('b')
    expect(accountToneOf('home@example.com')).toBe('d')
  })

  it('should tell the default profiles of two machines apart', () => {
    expect(accountToneOf(':/home/j/.claude')).toBe('d')
    expect(accountToneOf('server:/home/j/.claude')).toBe('a')
  })
})

describe('freePercentOf', () => {
  it('should leave what the 5-hour window has not used', () => {
    expect(freePercentOf(account('work', null, [42.4, 63]))).toBe(58)
  })

  it('should have nothing to say without a 5-hour window', () => {
    expect(freePercentOf(account('work', null, []))).toBeNull()
  })
})

describe('problemKeyOf', () => {
  it('should word a problem TokenScope reported as its report', () => {
    expect(problemKeyOf('rate_limited', 'tokenscope')).toBe('usage.scope_problems.rate_limited')
  })

  it('should use the own texts for agentd and an older agentd without a source', () => {
    expect([problemKeyOf('rate_limited', 'anthropic'), problemKeyOf('expired')]).toEqual([
      'usage.problems.rate_limited',
      'usage.problems.expired'
    ])
  })
})
