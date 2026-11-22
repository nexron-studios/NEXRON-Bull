import { describe, expect, it } from 'vitest'
import { applyEvent, newTab, type ChatTabState } from '../chatTab'
import { offerKeyOf, resetOf, waitHintKeyOf, waitingTabsOf, withLimit } from '../limits'
import { sessionRowsOf } from '../sessionList'
import type { AccountRefProps, LimitState } from '@/types/agentd.type'

const NOW = new Date(2026, 10, 18, 0, 20).getTime()

const tab = (fields: Partial<ChatTabState> = {}): ChatTabState => ({
  ...newTab({
    id: 't1',
    title: 'Kalender',
    profile: '/home/.claude-privat',
    account: 'privat',
    cwd: 'C:\\me\\dev\\projects\\kramlos',
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  ...fields
})

const account = (label: string, used: number | null, resets: number | null): AccountRefProps => ({
  profile: `/home/.claude-${label}`,
  label,
  used_percent: used,
  resets_at_ms: resets
})

const waiting: LimitState = {
  kind: 'waiting',
  account: account('privat', 100, NOW + 3 * 60 * 60_000),
  window: 'five_hour',
  reason: 'no_account',
  candidates: [],
  queue: [{ id: 1, text: 'Danach die Tests', images: 0 }]
}

describe('withLimit', () => {
  it('should move the tab to the new account and note the move in the chat', () => {
    const moved: LimitState = {
      kind: 'moved',
      from: account('privat', 100, null),
      to: account('office', 42, null)
    }

    const result = withLimit(tab({ notice: "You've hit your limit" }), moved, NOW)

    expect([result.profile, result.account, result.notice]).toEqual([
      '/home/.claude-office',
      'office',
      null
    ])
    expect(result.messages.at(-1)?.blocks).toEqual([
      { type: 'account_moved', from: moved.from, to: moved.to }
    ])
  })

  it('should show a move agentd reports again after an attach only once', () => {
    const moved: LimitState = {
      kind: 'moved',
      from: account('privat', 100, null),
      to: account('office', 42, null)
    }

    const once = withLimit(tab(), moved, NOW)
    const again = withLimit(once, moved, NOW + 1000)

    expect(again.messages.length).toBe(1)
  })

  it('should replace the raw limit notice and a planned move while the chat waits', () => {
    const result = withLimit(
      tab({ notice: "You've hit your limit", moveAfterTurn: '/home/.claude-office' }),
      waiting,
      NOW
    )

    expect([result.limit.kind, result.notice, result.moveAfterTurn]).toEqual([
      'waiting',
      null,
      null
    ])
  })
})

describe('waitHintKeyOf', () => {
  it('should explain each reason with its own text', () => {
    expect(['policy', 'ask', 'no_account', 'undone'].map((r) => waitHintKeyOf(r as never))).toEqual(
      [
        'chat.limit.wait_policy',
        'chat.limit.wait_ask',
        'chat.limit.wait_no_account',
        'chat.limit.wait_undone'
      ]
    )
  })
})

describe('offerKeyOf', () => {
  it('should offer a one-off move when no allowed account had room', () => {
    expect([offerKeyOf('no_account'), offerKeyOf('ask')]).toEqual([
      'chat.limit.move_once',
      'chat.limit.move_to'
    ])
  })
})

describe('resetOf', () => {
  it('should show the clock time and the time left, rounded up to the minute', () => {
    const resets = new Date(2026, 10, 18, 3, 25).getTime()

    expect(resetOf(resets, NOW - 30_000, 'de')).toEqual({ at: '03:25', left: '3:06' })
  })

  it('should show nothing for a reset that passed or is unknown', () => {
    expect([resetOf(NOW - 1, NOW, 'de'), resetOf(null, NOW, 'de')]).toEqual([null, null])
  })
})

describe('a waiting chat in the session list', () => {
  it('should sit in its own group whatever its turn did', () => {
    const rows = sessionRowsOf([tab({ status: 'idle', limit: waiting })], [], NOW)

    expect(rows.map((row) => row.group)).toEqual(['waiting'])
  })
})

describe('applyEvent started', () => {
  it('should take over an account a limit moved the chat to while the app was away', () => {
    const result = applyEvent(tab(), {
      type: 'started',
      id: null,
      tab: 't1',
      session_id: 's1',
      working: false,
      profile: '/home/.claude-office',
      account: 'office'
    })

    expect([result.profile, result.account]).toEqual(['/home/.claude-office', 'office'])
  })

  it('should keep a default profile without folder when the account is the same', () => {
    const result = applyEvent(tab({ profile: null, account: 'default' }), {
      type: 'started',
      id: null,
      tab: 't1',
      session_id: 's1',
      working: false,
      profile: '/home/.claude',
      account: 'default'
    })

    expect(result.profile).toBe(null)
  })
})

describe('waitingTabsOf', () => {
  it('should list only the waiting chats of that account on that machine', () => {
    const tabs = [
      tab({ id: 'a', limit: waiting }),
      tab({ id: 'b' }),
      tab({ id: 'c', limit: waiting, machine: 'nexron-server' }),
      tab({ id: 'd', limit: waiting, account: 'office' })
    ]

    expect(waitingTabsOf(tabs, null, 'privat').map((t) => t.id)).toEqual(['a'])
  })
})
