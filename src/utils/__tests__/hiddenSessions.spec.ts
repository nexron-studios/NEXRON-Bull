import { describe, expect, it } from 'vitest'
import type { SessionSummaryProps } from '@/types/agentd.type'
import {
  MAX_HIDDEN_SESSIONS,
  hiddenKeyOf,
  visibleSessionsOf,
  withHidden,
  withoutHidden
} from '../hiddenSessions'

const session = (id: string, account = 'work'): SessionSummaryProps => ({
  session_id: id,
  profile: 'C:\Users\me\.claude-work',
  account,
  cwd: 'C:\work',
  title: id,
  modified_ms: 1
})

describe('hiddenKeyOf', () => {
  it('should tell machines and accounts apart', () => {
    expect([
      hiddenKeyOf(null, 'work', 's1'),
      hiddenKeyOf('nexron-server', 'work', 's1'),
      hiddenKeyOf(null, 'default', 's1')
    ]).toEqual(['|work:s1', 'nexron-server|work:s1', '|default:s1'])
  })
})

describe('visibleSessionsOf', () => {
  it('should leave out only the hidden session of that machine and account', () => {
    const hidden = withHidden({}, [hiddenKeyOf(null, 'work', 's1')], 5)
    const shown = visibleSessionsOf(hidden, null, [
      session('s1'),
      session('s1', 'default'),
      session('s2')
    ])
    expect(shown.map((s) => `${s.account}:${s.session_id}`)).toEqual(['default:s1', 'work:s2'])
    expect(visibleSessionsOf(hidden, 'nexron-server', [session('s1')])).toHaveLength(1)
  })
})

describe('withHidden and withoutHidden', () => {
  it('should bring a session back on undo', () => {
    const key = hiddenKeyOf(null, 'work', 's1')
    expect(withoutHidden(withHidden({ other: 1 }, [key], 5), [key])).toEqual({ other: 1 })
  })

  it('should keep only the newest entries', () => {
    const many = Object.fromEntries(
      Array.from({ length: MAX_HIDDEN_SESSIONS }, (_, at) => [`k${at}`, at])
    )
    const next = withHidden(many, ['newest'], 10_000)
    expect([Object.keys(next).length, 'newest' in next, 'k0' in next]).toEqual([
      MAX_HIDDEN_SESSIONS,
      true,
      false
    ])
  })
})
