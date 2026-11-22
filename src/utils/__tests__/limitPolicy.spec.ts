import { describe, expect, it } from 'vitest'
import type { AccountCardProps } from '../accountCards'
import {
  accountKeyOfLabel,
  folderSuggestionsOf,
  limitAccountsOf,
  orderedAccountsOf,
  ruleFallbackOf,
  ruleProblemOf,
  withRule,
  withShownOrder,
  withoutRule,
  type LimitAccount
} from '../limitPolicy'

const cardOf = (
  machine: string | null,
  label: string,
  email: string | null,
  isOffered = true
): AccountCardProps => ({
  machine,
  profile: { label, dir: `C:\\Users\\me\\.claude-${label}`, email },
  accountKey: email ?? `${machine ?? ''}:C:\\Users\\me\\.claude-${label}`,
  plan: 'Max',
  loginState: 'logged_in',
  isOffered,
  isDefault: false,
  fiveHour: null,
  week: null
})

const accountOf = (label: string): LimitAccount => ({ label, accountKey: label, plan: null })
const labelsOf = (accounts: LimitAccount[]) => accounts.map((account) => account.label)

describe('limitAccountsOf', () => {
  it('should list a label offered on two machines once, with the colour of the first', () => {
    const groups = [
      { cards: [cardOf(null, 'office', 'work@example.com')] },
      {
        cards: [cardOf('server', 'office', 'other@example.com'), cardOf('server', 'privat', null)]
      }
    ]

    expect(limitAccountsOf(groups)).toEqual([
      { label: 'office', accountKey: 'work@example.com', plan: 'Max' },
      { label: 'privat', accountKey: 'server:C:\\Users\\me\\.claude-privat', plan: 'Max' }
    ])
  })

  it('should list a second profile on the same login once', () => {
    const groups = [
      {
        cards: [
          cardOf(null, 'default', 'me@example.com'),
          cardOf(null, 'gmail', 'me@example.com'),
          cardOf(null, 'office', 'work@example.com')
        ]
      }
    ]

    expect(labelsOf(limitAccountsOf(groups))).toEqual(['default', 'office'])
  })

  it('should leave out an account switched off on every machine', () => {
    const groups = [{ cards: [cardOf(null, 'default', null, false), cardOf(null, 'work', null)] }]

    expect(labelsOf(limitAccountsOf(groups))).toEqual(['work'])
  })

  it('should keep a label that one machine still offers', () => {
    const groups = [
      { cards: [cardOf(null, 'privat', null, false)] },
      { cards: [cardOf('server', 'privat', null)] }
    ]

    expect(labelsOf(limitAccountsOf(groups))).toEqual(['privat'])
  })
})

describe('accountKeyOfLabel', () => {
  it('should take the colour key of the account with that label', () => {
    expect(
      accountKeyOfLabel([{ label: 'office', accountKey: 'work@example.com', plan: null }], 'office')
    ).toBe('work@example.com')
  })

  it('should key a label no machine offers by the label alone', () => {
    expect(accountKeyOfLabel([], 'privat')).toBe(':privat')
  })
})

describe('orderedAccountsOf', () => {
  it('should put arranged accounts first and the others after them by name', () => {
    const accounts = ['zeta', 'privat', 'alpha', 'office'].map(accountOf)

    expect(labelsOf(orderedAccountsOf(accounts, ['privat', 'gone', 'office']))).toEqual([
      'privat',
      'office',
      'alpha',
      'zeta'
    ])
  })

  it('should sort by name while nothing is arranged', () => {
    expect(labelsOf(orderedAccountsOf(['b', 'a'].map(accountOf), []))).toEqual(['a', 'b'])
  })
})

describe('withShownOrder', () => {
  it('should keep labels that are not shown right now behind the shown ones', () => {
    expect(withShownOrder(['offline', 'office', 'privat'], ['privat', 'office'])).toEqual([
      'privat',
      'office',
      'offline'
    ])
  })
})

describe('ruleFallbackOf', () => {
  it('should move, else wait, with two accounts in automatic mode', () => {
    expect(ruleFallbackOf(2, 'auto')).toBe('move_or_wait')
  })

  it('should ask, else wait, with two accounts when the mode asks first', () => {
    expect(ruleFallbackOf(3, 'ask')).toBe('ask_or_wait')
  })

  it('should only wait with one account or when the mode never moves', () => {
    expect([ruleFallbackOf(1, 'auto'), ruleFallbackOf(2, 'wait')]).toEqual(['wait', 'wait'])
  })
})

describe('ruleProblemOf', () => {
  const rules = [{ folder: 'Kramlos', accounts: ['privat'] }]

  it('should accept a new folder with an account', () => {
    expect(ruleProblemOf({ folder: 'nexron-chat', accounts: ['office'] }, rules, null)).toBeNull()
  })

  it('should ask for a folder name when there is only space', () => {
    expect(ruleProblemOf({ folder: '  ', accounts: ['office'] }, rules, null)).toBe('empty')
  })

  it('should ask for at least one account', () => {
    expect(ruleProblemOf({ folder: 'nexron-chat', accounts: [] }, rules, null)).toBe('no_account')
  })

  it('should refuse a second rule for a folder that differs only in case', () => {
    expect(ruleProblemOf({ folder: ' kramlos ', accounts: ['privat'] }, rules, null)).toBe('taken')
  })

  it('should let a rule being changed keep its own folder', () => {
    expect(ruleProblemOf({ folder: 'kramlos', accounts: ['office'] }, rules, 'Kramlos')).toBeNull()
  })
})

describe('withRule', () => {
  const rules = [
    { folder: 'kramlos', accounts: ['privat'] },
    { folder: 'reels', accounts: ['privat'] }
  ]

  it('should add a new rule at the end with its folder trimmed', () => {
    expect(withRule(rules, { folder: ' bull ', accounts: ['office'] }, null)).toEqual([
      ...rules,
      { folder: 'bull', accounts: ['office'] }
    ])
  })

  it('should replace a changed rule in its place', () => {
    expect(withRule(rules, { folder: 'kram', accounts: ['office'] }, 'kramlos')).toEqual([
      { folder: 'kram', accounts: ['office'] },
      { folder: 'reels', accounts: ['privat'] }
    ])
  })
})

describe('withoutRule', () => {
  it('should drop the rule of that folder only', () => {
    const rules = [
      { folder: 'kramlos', accounts: ['privat'] },
      { folder: 'reels', accounts: ['privat'] }
    ]

    expect(withoutRule(rules, 'kramlos')).toEqual([{ folder: 'reels', accounts: ['privat'] }])
  })
})

describe('folderSuggestionsOf', () => {
  it('should offer each repository once, sorted, without worktrees and ruled folders', () => {
    const cwds = [
      'C:\\me\\dev\\projects\\nexron-chat',
      'C:\\me\\dev\\worktrees\\nexron-chat-limit-settings',
      'C:\\me\\dev\\projects\\kramlos',
      'C:\\me\\dev\\projects\\agentdashboard\\',
      '/home/me/nexron-chat',
      'C:\\me\\dev\\projects\\Reels'
    ]

    expect(folderSuggestionsOf(cwds, [{ folder: 'reels', accounts: ['privat'] }])).toEqual([
      'agentdashboard',
      'kramlos',
      'nexron-chat'
    ])
  })

  it('should leave out scratch folders under a temp folder and generated job folders', () => {
    const cwds = [
      'C:\\Users\\me\\AppData\\Local\\Temp\\claude\\probe-cwd',
      '/tmp/scratch',
      'C:\\Users\\nexron\\forge-data\\jobs\\330fc7a2-f215-45d3-8e04-8536995da1fd',
      'C:\\me\\dev\\projects\\bull'
    ]

    expect(folderSuggestionsOf(cwds, [])).toEqual(['bull'])
  })

  it('should keep a repository whose own name only looks like a temp folder', () => {
    expect(folderSuggestionsOf(['C:\\me\\dev\\projects\\temp'], [])).toEqual(['temp'])
  })
})
