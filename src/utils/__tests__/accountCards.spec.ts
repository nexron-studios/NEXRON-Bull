import { describe, expect, it } from 'vitest'
import type { ProfileProps } from '@/types/agentd.type'
import type { MachineQuota } from '@/utils/quota'
import { EMPTY_ACCOUNT_SETTINGS, withOffered } from '@/utils/accountSettings'
import {
  accountCardsOf,
  accountLabelOf,
  accountNameOf,
  folderNameOf,
  isLoggedOut
} from '../accountCards'

const work: ProfileProps = {
  label: 'work',
  dir: 'C:\\Users\\Home\\.claude-work',
  email: 'alex@work.example'
}
const fresh: ProfileProps = {
  label: 'kunde-x',
  dir: 'C:\\Users\\Home\\.claude-kunde-x',
  email: null
}

const quotaOf = (profile: ProfileProps, extra: Partial<MachineQuota>): MachineQuota => ({
  machine: null,
  profile: profile.dir,
  label: profile.label,
  email: profile.email,
  plan: 'max',
  windows: [],
  fetched_ms: 0,
  problem: null,
  ...extra
})

describe('accountCardsOf', () => {
  it('should describe a logged-in account with plan, default and both quota windows', () => {
    const fiveHour = { key: 'five_hour', used_percent: 42, resets_at: null } as const
    const week = { key: 'seven_day', used_percent: 63, resets_at: null } as const
    const quotas = [quotaOf(work, { windows: [fiveHour, week] })]

    const [card] = accountCardsOf(null, [work], quotas, EMPTY_ACCOUNT_SETTINGS, false)

    expect(card).toEqual({
      machine: null,
      profile: work,
      accountKey: 'alex@work.example',
      plan: 'Max',
      loginState: 'logged_in',
      isOffered: true,
      isDefault: true,
      fiveHour,
      week
    })
  })

  it('should show a new account without login as logged out once the quota answered', () => {
    const quotas = [quotaOf(fresh, { plan: null, problem: 'no_login' })]

    const [card] = accountCardsOf(null, [fresh], quotas, EMPTY_ACCOUNT_SETTINGS, false)

    expect([card.loginState, card.plan, card.accountKey]).toEqual([
      'logged_out',
      null,
      ':C:\\Users\\Home\\.claude-kunde-x'
    ])
  })

  it('should keep the login open while the quota is on its way, unknown when it cannot come', () => {
    expect(accountCardsOf(null, [work], [], EMPTY_ACCOUNT_SETTINGS, true)[0].loginState).toBe(
      'checking'
    )
    expect(accountCardsOf(null, [work], [], EMPTY_ACCOUNT_SETTINGS, false)[0].loginState).toBe(
      'unknown'
    )
  })

  it('should mark a switched-off account and pass the default on to the next one', () => {
    const settings = withOffered(EMPTY_ACCOUNT_SETTINGS, null, fresh.dir, false)

    const cards = accountCardsOf(null, [fresh, work], [], settings, false)

    expect(cards.map((card) => [card.profile.label, card.isOffered, card.isDefault])).toEqual([
      ['kunde-x', false, false],
      ['work', true, true]
    ])
  })
})

describe('folderNameOf', () => {
  it('should keep only the last part of a profile folder', () => {
    expect(folderNameOf('C:\\Users\\Home\\.claude-work')).toBe('.claude-work')
    expect(folderNameOf('/home/j/.claude')).toBe('.claude')
  })
})

describe('accountNameOf', () => {
  it('should name an account by its login', () => {
    expect(accountNameOf(work)).toBe('alex@work.example')
  })

  it('should keep the folder name while the folder has no login', () => {
    expect(accountNameOf(fresh)).toBe('kunde-x')
  })
})

describe('isLoggedOut', () => {
  const cardOf = (problem: MachineQuota['problem'] | 'pending') =>
    accountCardsOf(
      null,
      [fresh],
      problem === 'pending' ? [] : [quotaOf(fresh, { problem })],
      EMPTY_ACCOUNT_SETTINGS,
      problem === 'pending'
    )[0]

  it('should count a folder left behind by an aborted login', () => {
    expect(isLoggedOut(cardOf('no_login'))).toBe(true)
  })

  it('should not count a folder whose login only hit the rate limit', () => {
    expect(isLoggedOut(cardOf('rate_limited'))).toBe(false)
  })

  it('should not count a folder while its quota is still checking', () => {
    expect(isLoggedOut(cardOf('pending'))).toBe(false)
  })
})

describe('accountLabelOf', () => {
  it('should add the folder so two folders of one login differ', () => {
    expect(accountLabelOf(work)).toBe('alex@work.example (.claude-work)')
  })
})
