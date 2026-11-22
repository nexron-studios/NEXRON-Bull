import { describe, expect, it } from 'vitest'
import { newTab, type ChatTabState } from '../chatTab'
import {
  doneSessionsOf,
  ghostCountOf,
  gridColumnsOf,
  modelFamilyOf,
  parseDoneRange,
  rangeStartOf,
  rankedDoneOf,
  withinRange,
  type DoneSession
} from '../overview'
import type { SessionSummaryProps } from '@/types/agentd.type'

const NOON = new Date(2026, 10, 15, 12, 0).getTime()
const MIDNIGHT = new Date(2026, 10, 15, 0, 0).getTime()
const WEEK_START = new Date(2026, 10, 9, 0, 0).getTime()

const tab = (id: string, fields: Partial<ChatTabState> = {}): ChatTabState => ({
  ...newTab({
    id,
    title: id,
    profile: null,
    account: 'office',
    cwd: 'C:\\me\\dev\\projects\\nexron-chat',
    machine: null,
    sessionId: `s-${id}`,
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  ...fields
})

const session = (id: string, modified: number, account = 'office'): SessionSummaryProps => ({
  session_id: id,
  profile: `C:\\Users\\Home\\.claude-${account}`,
  account,
  cwd: 'C:\\me\\dev\\projects\\reels',
  title: `Session ${id}`,
  modified_ms: modified
})

describe('parseDoneRange', () => {
  it('should keep a known range', () => {
    expect(parseDoneRange('week')).toBe('week')
  })

  it('should fall back to today for anything else', () => {
    expect(parseDoneRange('year')).toBe('today')
    expect(parseDoneRange(undefined)).toBe('today')
  })
})

describe('doneSessionsOf', () => {
  it('should merge machines newest first with machine and account in the key', () => {
    const done = doneSessionsOf(
      [
        { machine: null, sessions: [session('one', NOON - 3000)] },
        { machine: 'nexron-server', sessions: [session('two', NOON - 1000)] }
      ],
      []
    )
    expect(done.map((entry) => entry.key)).toEqual(['nexron-server:two:office', ':one:office'])
  })

  it('should leave out a session a tab is still working on', () => {
    const done = doneSessionsOf(
      [{ machine: null, sessions: [session('s-busy', NOON), session('s-rest', NOON)] }],
      [tab('busy', { status: 'working' })]
    )
    expect(done.map((entry) => entry.key)).toEqual([':s-rest:office'])
  })

  it('should list a tab that ended its turn as the tab, not as its transcript', () => {
    const done = doneSessionsOf(
      [{ machine: null, sessions: [session('s-open', NOON - 9000)] }],
      [tab('open', { status: 'idle', finishedAt: NOON - 1000 })]
    )
    expect(done).toEqual([
      {
        key: ':open',
        machine: null,
        title: 'open',
        cwd: 'C:\\me\\dev\\projects\\nexron-chat',
        account: 'office',
        finishedAt: NOON - 1000,
        source: { kind: 'tab', tabId: 'open' }
      }
    ])
  })

  it('should date a restored tab by its transcript', () => {
    const done = doneSessionsOf(
      [{ machine: null, sessions: [session('s-restored', NOON - 9000)] }],
      [tab('restored', { status: 'ended' })]
    )
    expect(done.map((entry) => [entry.key, entry.finishedAt])).toEqual([[':restored', NOON - 9000]])
  })

  it('should not hide a session of the same id on another machine', () => {
    const done = doneSessionsOf(
      [{ machine: 'nexron-server', sessions: [session('s-busy', NOON)] }],
      [tab('busy', { status: 'working' })]
    )
    expect(done).toHaveLength(1)
  })

  it('should date a restored tab by the newest copy of its moved transcript', () => {
    const done = doneSessionsOf(
      [
        {
          machine: null,
          sessions: [
            session('s-moved', NOON - 1000, 'office'),
            session('s-moved', NOON - 9000, 'privat')
          ]
        }
      ],
      [tab('moved', { status: 'ended' })]
    )
    expect(done.map((entry) => entry.finishedAt)).toEqual([NOON - 1000])
  })

  it('should keep only the newest copy of a session moved to another account', () => {
    const done = doneSessionsOf(
      [
        {
          machine: null,
          sessions: [session('moved', NOON - 5000, 'privat'), session('moved', NOON, 'office')]
        }
      ],
      []
    )
    expect(done.map((entry) => entry.account)).toEqual(['office'])
  })
})

describe('rangeStartOf', () => {
  it('should start today at midnight', () => {
    expect(rangeStartOf('today', NOON)).toBe(MIDNIGHT)
  })

  it('should start the week six days before today', () => {
    expect(rangeStartOf('week', NOON)).toBe(WEEK_START)
  })
})

describe('withinRange', () => {
  it('should drop sessions older than the range', () => {
    const done = doneSessionsOf(
      [{ machine: null, sessions: [session('today', NOON), session('old', WEEK_START - 1)] }],
      []
    )
    expect(withinRange(done, 'today', NOON).map((entry) => entry.key)).toEqual([':today:office'])
    expect(withinRange(done, 'all', NOON)).toHaveLength(2)
  })
})

describe('modelFamilyOf', () => {
  it('should read the family from a full model id', () => {
    expect(modelFamilyOf('claude-haiku-4-5-20251001')).toBe('haiku')
    expect(modelFamilyOf('claude-opus-4-7[1m]')).toBe('opus')
  })

  it('should call an unknown model other', () => {
    expect(modelFamilyOf('<synthetic>')).toBe('other')
  })
})

describe('rankedDoneOf', () => {
  const doneTab = (id: string, finishedAt: number): DoneSession => ({
    key: `:${id}`,
    machine: null,
    title: id,
    cwd: 'C:\\me\\dev\\projects\\nexron-chat',
    account: 'office',
    finishedAt,
    source: { kind: 'tab', tabId: id }
  })
  const doneSession = (id: string, finishedAt: number): DoneSession => ({
    key: `:${id}:office`,
    machine: null,
    title: id,
    cwd: 'C:\\me\\dev\\projects\\reels',
    account: 'office',
    finishedAt,
    source: { kind: 'session', session: session(id, finishedAt) }
  })

  it('should lead with the unseen chats in finish order, then the rest newest first', () => {
    const done = [
      doneTab('watched', NOON - 1000),
      doneTab('second', NOON - 2000),
      doneSession('old', NOON - 3000),
      doneTab('first', NOON - 4000)
    ]
    const ranks = new Map([
      ['first', 1],
      ['second', 2]
    ])
    const rows = rankedDoneOf(done, ranks, 'today', NOON)
    expect(rows.map((row) => [row.title, row.rank])).toEqual([
      ['first', 1],
      ['second', 2],
      ['watched', null],
      ['old', null]
    ])
  })

  it('should keep an unseen chat that finished before the range', () => {
    const done = [doneTab('today', NOON - 1000), doneTab('yesterday', MIDNIGHT - 1000)]
    const rows = rankedDoneOf(done, new Map([['yesterday', 1]]), 'today', NOON)
    expect(rows.map((row) => row.title)).toEqual(['yesterday', 'today'])
  })

  it('should leave out seen chats before the range', () => {
    const done = [doneTab('today', NOON - 1000), doneTab('yesterday', MIDNIGHT - 1000)]
    expect(rankedDoneOf(done, new Map(), 'today', NOON).map((row) => row.title)).toEqual(['today'])
  })

  it('should never number a transcript, even with a tab id of the same name', () => {
    const rows = rankedDoneOf([doneSession('a', NOON)], new Map([['a', 1]]), 'all', NOON)
    expect(rows.map((row) => row.rank)).toEqual([null])
  })
})

describe('gridColumnsOf', () => {
  it('should give a phone one column', () => {
    expect(gridColumnsOf(358)).toBe(1)
  })

  it('should give two columns once two cards fit', () => {
    expect(gridColumnsOf(559)).toBe(1)
    expect(gridColumnsOf(560)).toBe(2)
  })

  it('should give three columns once three fit, and never more', () => {
    expect(gridColumnsOf(847)).toBe(2)
    expect(gridColumnsOf(848)).toBe(3)
    expect(gridColumnsOf(2400)).toBe(3)
  })

  it('should give one column before the grid is measured', () => {
    expect(gridColumnsOf(0)).toBe(1)
  })
})

describe('ghostCountOf', () => {
  it('should fill the open places of the last row', () => {
    expect(ghostCountOf(4, 3)).toBe(2)
    expect(ghostCountOf(1, 3)).toBe(2)
    expect(ghostCountOf(5, 3)).toBe(1)
    expect(ghostCountOf(3, 2)).toBe(1)
  })

  it('should add none to a full row', () => {
    expect(ghostCountOf(3, 3)).toBe(0)
    expect(ghostCountOf(6, 3)).toBe(0)
    expect(ghostCountOf(4, 2)).toBe(0)
  })

  it('should add none in one column or when nothing runs', () => {
    expect(ghostCountOf(3, 1)).toBe(0)
    expect(ghostCountOf(0, 3)).toBe(0)
  })
})
