import { describe, expect, it } from 'vitest'
import { newTab, type ChatTabState } from '../chatTab'
import {
  chatNameOf,
  folderNameOf,
  groupRows,
  isSameSearchable,
  machineStateOf,
  mostPressingOf,
  rowActivityOf,
  searchableOf,
  sessionRowsOf,
  withManualOrder
} from '../sessionList'
import type { ChatMessage, SessionSummaryProps } from '@/types/agentd.type'

const NOON = new Date(2026, 10, 15, 12, 0).getTime()
const YESTERDAY = new Date(2026, 10, 14, 18, 0).getTime()
const MINUTE = 60_000

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
  profile: `/home/alex/.claude-${account}`,
  account,
  cwd: '/home/alex/reels',
  title: `Session ${id}`,
  modified_ms: modified
})

const keysByGroup = (tabs: ChatTabState[], recent: SessionSummaryProps[] = []) =>
  groupRows(sessionRowsOf(tabs, recent, NOON)).map(({ group, rows }) => [
    group,
    rows.map((row) => row.key)
  ])

describe('chatNameOf', () => {
  it('should join the folder and the first four characters of the session UUID', () => {
    const id = '1a875471-77b0-4d2e-9a41-0c5be1f0d6a2'
    expect([
      chatNameOf('C:\\me\\dev\\projects\\nexron-chat\\', id),
      chatNameOf('C:\\me', id),
      chatNameOf('/home/alex/reels', id)
    ]).toEqual(['nexron-chat-1a87', 'me-1a87', 'reels-1a87'])
  })
})

describe('folderNameOf', () => {
  it('should take the last folder of a Windows or POSIX path', () => {
    expect([folderNameOf('C:\\me\\dev\\kramlos\\'), folderNameOf('/home/alex/reels')]).toEqual([
      'kramlos',
      'reels'
    ])
  })
})

describe('sessionRowsOf and groupRows', () => {
  it('should put approvals first, then running, then finished tabs', () => {
    const tabs = [
      tab('done', { status: 'idle', finishedAt: NOON - 5 * MINUTE }),
      tab('run', { status: 'working', turn: { startedAt: NOON - MINUTE, afterUuid: null } }),
      tab('ask', { status: 'asking', turn: { startedAt: NOON - 9 * MINUTE, afterUuid: null } })
    ]
    expect(keysByGroup(tabs)).toEqual([
      ['needs', ['ask']],
      ['running', ['run']],
      ['done', ['done']]
    ])
  })

  it('should order running tabs longest first and finished ones newest first', () => {
    const tabs = [
      tab('short', { status: 'working', turn: { startedAt: NOON - MINUTE, afterUuid: null } }),
      tab('long', { status: 'working', turn: { startedAt: NOON - 30 * MINUTE, afterUuid: null } }),
      tab('old', { status: 'idle', finishedAt: NOON - 60 * MINUTE }),
      tab('new', { status: 'idle', finishedAt: NOON - MINUTE })
    ]
    expect(keysByGroup(tabs)).toEqual([
      ['running', ['long', 'short']],
      ['done', ['new', 'old']]
    ])
  })

  it('should sort ended tabs by their transcript time when the app did not see them finish', () => {
    const tabs = [tab('before', { status: 'ended' }), tab('today', { status: 'ended' })]
    const recent = [session('s-today', NOON - 2 * MINUTE), session('s-before', YESTERDAY)]
    expect(keysByGroup(tabs, recent)).toEqual([['done', ['today', 'before']]])
  })

  it('should keep a tab finished on an earlier day under "done"', () => {
    const tabs = [
      tab('yesterday', { status: 'idle', finishedAt: YESTERDAY }),
      tab('today', { status: 'idle', finishedAt: NOON - MINUTE })
    ]
    expect(keysByGroup(tabs)).toEqual([['done', ['today', 'yesterday']]])
  })

  it('should list only open tabs, not sessions closed today', () => {
    const recent = [session('fresh', NOON - 3 * MINUTE), session('stale', YESTERDAY)]
    expect(keysByGroup([], recent)).toEqual([])
  })

  it('should keep the order of ranked search hits inside a group', () => {
    const tabs = [
      tab('old', { status: 'idle', finishedAt: NOON - 60 * MINUTE }),
      tab('new', { status: 'idle', finishedAt: NOON - MINUTE })
    ]
    const ranked = groupRows(sessionRowsOf(tabs, [], NOON), true)
    expect(ranked[0].rows.map((row) => row.key)).toEqual(['old', 'new'])
  })

  it('should carry folder name, account and the time a row is about', () => {
    const tabs = [
      tab('run', { status: 'working', turn: { startedAt: NOON - 6 * MINUTE, afterUuid: null } })
    ]
    const [row] = sessionRowsOf(tabs, [], NOON)
    expect([row.folder, row.account, row.since]).toEqual([
      'nexron-chat',
      'office',
      NOON - 6 * MINUTE
    ])
  })
})

describe('groupRows with groups shown when empty', () => {
  it('should keep the named groups without rows and drop the others', () => {
    const tabs = [tab('done', { status: 'idle', finishedAt: NOON - MINUTE })]
    const groups = groupRows(sessionRowsOf(tabs, [], NOON), false, ['needs', 'running', 'done'])
    expect(groups.map(({ group, rows }) => [group, rows.length])).toEqual([
      ['needs', 0],
      ['running', 0],
      ['done', 1]
    ])
  })
})

describe('withManualOrder', () => {
  const tabs = [
    tab('long', { status: 'working', turn: { startedAt: NOON - 30 * MINUTE, afterUuid: null } }),
    tab('short', { status: 'working', turn: { startedAt: NOON - MINUTE, afterUuid: null } }),
    tab('old', { status: 'idle', finishedAt: NOON - 60 * MINUTE }),
    tab('new', { status: 'idle', finishedAt: NOON - MINUTE })
  ]
  const ordered = withManualOrder(groupRows(sessionRowsOf(tabs, [], NOON)), [
    'short',
    'long',
    'old',
    'new'
  ])

  it('should follow the dragged order in the running group', () => {
    expect(ordered[0].rows.map((row) => row.key)).toEqual(['short', 'long'])
  })

  it('should keep finished rows newest first whatever order was stored', () => {
    expect(ordered[1].rows.map((row) => row.key)).toEqual(['new', 'old'])
  })
})

describe('an answer that ends on a question', () => {
  const asking = (id: string): ChatTabState =>
    tab(id, {
      status: 'idle',
      finishedAt: NOON - MINUTE,
      messages: [
        {
          uuid: `a-${id}`,
          role: 'assistant',
          at: null,
          blocks: [{ type: 'text', text: '> [!question] Braucht dich\n> Soll der Ordner weg?' }]
        }
      ]
    })

  it('should wait under "needs" like an approval', () => {
    const done = tab('done', { status: 'idle', finishedAt: NOON - MINUTE })
    expect(keysByGroup([asking('ask'), done])).toEqual([
      ['needs', ['ask']],
      ['done', ['done']]
    ])
  })

  it('should give its machine the "needs" dot', () => {
    expect(machineStateOf([asking('ask')], NOON)).toBe('needs')
  })

  it('should say that it waits for an answer', () => {
    expect(rowActivityOf(asking('ask'))).toEqual({ kind: 'ask', reason: 'question' })
  })

  it('should leave an older chat that ended on a question under "done"', () => {
    const old = { ...asking('old'), status: 'ended' as const, finishedAt: YESTERDAY }
    expect([keysByGroup([old]), machineStateOf([old], NOON)]).toEqual([[['done', ['old']]], null])
  })

  it('should count its time from the answer, not from the turn start', () => {
    expect(sessionRowsOf([asking('ask')], [], NOON)[0].since).toBe(NOON - MINUTE)
  })
})

describe('machineStateOf', () => {
  it('should rank an approval above work above done', () => {
    const working = tab('w', { status: 'working' })
    const asking = tab('a', { status: 'asking' })
    const idle = tab('i', { status: 'idle' })
    const idleToday = { ...idle, finishedAt: NOON - MINUTE }
    expect([
      machineStateOf([idleToday, working, asking], NOON),
      machineStateOf([idleToday, working], NOON),
      machineStateOf([idleToday], NOON),
      machineStateOf([], NOON)
    ]).toEqual(['needs', 'running', 'done', null])
  })

  it('should not call ended, disconnected or yesterday tabs done', () => {
    const ended = tab('e', { status: 'ended' })
    const yesterday = tab('y', { status: 'idle', finishedAt: YESTERDAY })
    expect(machineStateOf([ended, yesterday], NOON)).toBe(null)
  })

  it('should not call a new chat running while Claude starts', () => {
    const fresh = tab('new', { sessionId: null, status: 'starting', history: 'loaded' })
    expect(machineStateOf([fresh], NOON)).toBe(null)
  })
})

describe('mostPressingOf', () => {
  it.each([
    ['an approval over work and done', [null, 'done', 'needs', 'running'], 'needs'],
    ['work over done', ['done', null, 'running'], 'running'],
    ['done over a quiet machine', [null, 'done'], 'done'],
    ['nothing when every machine is quiet', [null, null], null],
    ['nothing without machines', [], null]
  ] as const)('should pick %s', (_, states, expected) => {
    expect(mostPressingOf([...states])).toBe(expected)
  })
})

describe('a new chat', () => {
  const fresh = tab('new', { sessionId: null, status: 'starting', history: 'loaded' })

  it('should wait under "empty" while Claude starts, not flash through "running"', () => {
    expect(keysByGroup([fresh])).toEqual([['empty', ['new']]])
  })

  it('should move to "running" once the first prompt is sent', () => {
    const prompt: ChatMessage = {
      uuid: 'p1',
      role: 'user',
      at: null,
      blocks: [{ type: 'text', text: 'Fix the header' }]
    }
    const sent = { ...fresh, pending: [prompt] }
    expect(keysByGroup([sent])).toEqual([['running', ['new']]])
  })
})

describe('a chat that moves to another account', () => {
  const moving = tab('moved', {
    status: 'starting',
    statusBeforeMove: 'idle',
    finishedAt: NOON - MINUTE
  })

  it('should stay under "done" while Claude starts in the other account', () => {
    expect(keysByGroup([moving])).toEqual([['done', ['moved']]])
  })

  it('should keep the real tab on the row for its actions', () => {
    const [row] = sessionRowsOf([moving], [], NOON)
    expect([row.status, row.tab.status]).toEqual(['idle', 'starting'])
  })

  it('should not light the machine as running meanwhile', () => {
    expect(machineStateOf([moving], NOON)).toBe('done')
  })

  it('should keep the finish time its transcript had under the old account', () => {
    const moved = tab('moved', { status: 'idle', account: 'gmail', sessionId: 's1' })
    const [row] = sessionRowsOf([moved], [session('s1', YESTERDAY, 'office')], NOON)
    expect([row.group, row.since]).toEqual(['done', YESTERDAY])
  })
})

describe('rowActivityOf', () => {
  it('should name the tool and target an approval waits for', () => {
    const permission = {
      requestId: 'r1',
      toolName: 'Bash',
      input: { command: 'git push -u origin' },
      suggestions: []
    }
    expect(rowActivityOf(tab('a', { status: 'asking', permission }))).toEqual({
      kind: 'tool',
      tool: 'Bash',
      target: 'git push -u origin'
    })
  })

  it('should tell a question apart from an approval', () => {
    const permission = { requestId: 'r1', toolName: 'AskUserQuestion', input: {}, suggestions: [] }
    expect(rowActivityOf(tab('a', { status: 'asking', permission }))).toEqual({
      kind: 'ask',
      reason: 'question'
    })
  })

  it('should name the running tool call of the current turn', () => {
    const read: ChatMessage = {
      uuid: 'm1',
      role: 'assistant',
      at: null,
      blocks: [
        {
          type: 'tool_use',
          id: 'c1',
          name: 'Read',
          input: { file_path: 'C:\\src\\CalendarWeek.vue' }
        }
      ]
    }
    const running = tab('r', {
      status: 'working',
      messages: [read],
      turn: { startedAt: NOON, afterUuid: null }
    })
    expect(rowActivityOf(running)).toEqual({
      kind: 'tool',
      tool: 'Read',
      target: 'CalendarWeek.vue'
    })
  })

  it('should say nothing once the tab is idle', () => {
    expect(rowActivityOf(tab('i', { status: 'idle' }))).toBe(null)
  })

  it('should say that something still runs in the background after the turn', () => {
    const idle = tab('b', { status: 'idle', backgroundTasks: { ids: ['a7f'], at: NOON } })
    expect(rowActivityOf(idle)).toEqual({ kind: 'state', state: 'background' })
  })
})

describe('a chat whose turn ended while something runs in the background', () => {
  // Task ids as Claude Code lists them: a background shell (`local_bash`) and an agent.
  it.each([
    ['a background shell', 'b3vtm9fpi'],
    ['a background agent', 'a472665f67fbbf6fa']
  ])('should stay under "running" while %s runs', (_, taskId) => {
    const idle = tab('b', {
      status: 'idle',
      finishedAt: null,
      backgroundTasks: { ids: [taskId], at: NOON }
    })
    const [row] = sessionRowsOf([idle], [], NOON)
    expect([row?.group, row?.status]).toEqual(['running', 'working'])
  })

  it('should light the machine dot as running', () => {
    const idle = tab('b', { status: 'idle', backgroundTasks: { ids: ['b3vtm9fpi'], at: NOON } })
    expect(machineStateOf([idle], NOON)).toBe('running')
  })
})

describe('searchableOf', () => {
  it('should let the search find a chat by the name its row shows', () => {
    const rows = sessionRowsOf(
      [tab('a', { sessionId: '1a875471-77b0' }), tab('b', { sessionId: null })],
      [],
      NOON
    )
    expect(searchableOf(rows).map((row) => row.chatName)).toEqual(['nexron-chat-1a87', ''])
  })
})

describe('isSameSearchable', () => {
  const row = {
    key: 'k',
    title: 'Kalender',
    folder: 'kramlos',
    chatName: 'kramlos-1a87',
    account: 'privat'
  }

  it('should treat equal fields as the same list', () => {
    expect(isSameSearchable([row], [{ ...row }])).toBe(true)
  })

  it('should notice a new title or another row count', () => {
    expect([
      isSameSearchable([row], [{ ...row, title: 'Kalender Woche' }]),
      isSameSearchable([row], [])
    ]).toEqual([false, false])
  })
})
