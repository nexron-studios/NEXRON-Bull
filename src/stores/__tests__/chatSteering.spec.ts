import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentdEvent, AgentdRequest, ChatMessage } from '@/types/agentd.type'
import { newTab, type ChatTabState } from '@/utils/chatTab'
import { useChatStore } from '../chat'
import { useDraftStore } from '../drafts'
import { useShellRunsStore } from '../shellRuns'

const { listeners, send, ask } = vi.hoisted(() => ({
  listeners: [] as ((event: AgentdEvent) => void)[],
  send: vi.fn((_message: AgentdRequest) => Promise.resolve()),
  ask: vi.fn()
}))

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: {
    send,
    ask,
    waitFor: vi.fn(),
    onEvent: (listener: (event: AgentdEvent) => void) => {
      listeners.push(listener)
      return () => {}
    },
    onReady: () => () => {}
  }
}))

const emit = (event: AgentdEvent) => listeners.forEach((listener) => listener(event))

/** Claude is in the middle of a turn that started at 1000. */
const workingTab = (fields: Partial<ChatTabState> = {}) => {
  const chat = useChatStore()
  const tab = newTab({
    id: 't1',
    title: 'Chat',
    profile: null,
    account: 'work',
    cwd: 'C:\\work\\app',
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  })
  chat.tabs = [
    {
      ...tab,
      status: 'working',
      history: 'loaded',
      turn: { startedAt: 1000, afterUuid: null },
      ...fields
    }
  ]
  return chat
}

const message = (uuid: string, role: ChatMessage['role'], blocks: ChatMessage['blocks']) =>
  ({ type: 'message', tab: 't1', message: { uuid, role, at: null, blocks } }) as const
const said = (uuid: string, text: string) => message(uuid, 'assistant', [{ type: 'text', text }])
const echo = (uuid: string, text: string) => message(uuid, 'user', [{ type: 'text', text }])
const toolResult = (uuid: string) =>
  message(uuid, 'user', [
    { type: 'tool_result', tool_use_id: 'toolu_1', is_error: false, content: [] }
  ])
const turnEnd = (isError = false): AgentdEvent => ({
  type: 'claude',
  tab: 't1',
  event: {
    type: 'result',
    subtype: isError ? 'error_during_execution' : 'success',
    result: '',
    is_error: isError
  }
})

const sentOps = () => send.mock.calls.map(([request]) => request.op)
const stampOf = () =>
  send.mock.calls.flatMap(([request]) =>
    request.op === 'send' && request.uuid ? [request.uuid] : []
  )[0]

describe('useChatStore: a message sent into the running turn', () => {
  beforeEach(() => {
    listeners.length = 0
    send.mockClear()
    ask.mockReset()
    setActivePinia(createPinia())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(5000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should go to Claude with a uuid it can be withdrawn by', () => {
    const chat = workingTab()

    chat.send('t1', 'use the blue one', [], 'intoTurn')

    expect([sentOps(), typeof stampOf()]).toEqual([['send'], 'string'])
  })

  it('should keep the tab running when the turn ends before Claude read it', () => {
    const chat = workingTab()
    chat.send('t1', 'use the blue one', [], 'intoTurn')

    emit(turnEnd())

    const [tab] = chat.tabs
    expect([tab.status, tab.finishedAt, tab.turn?.startedAt, tab.pending.length]).toEqual([
      'working',
      null,
      1000,
      1
    ])
  })

  it('should finish once the turn Claude started with it ends', () => {
    const chat = workingTab()
    chat.send('t1', 'use the blue one', [], 'intoTurn')
    emit(turnEnd())

    vi.setSystemTime(9000)
    emit(echo('u2', 'use the blue one'))
    emit(said('a2', 'Blue it is.'))
    emit(turnEnd())

    const [tab] = chat.tabs
    expect([tab.status, tab.finishedAt, tab.pending]).toEqual(['idle', 9000, []])
  })

  it('should not wait for an echo past the next turn', () => {
    const chat = workingTab()
    chat.send('t1', 'use the blue one', [], 'intoTurn')
    emit(turnEnd())

    emit(said('a2', 'Done.'))
    emit(turnEnd())

    const [tab] = chat.tabs
    expect([tab.status, tab.pending, tab.messages.map((m) => m.role)]).toEqual([
      'idle',
      [],
      ['assistant', 'user']
    ])
  })

  it('should end the turn on a stop even with a message still unread', () => {
    const chat = workingTab()
    chat.send('t1', 'use the blue one', [], 'intoTurn')

    emit(turnEnd(true))

    expect(chat.tabs[0].status).toBe('idle')
  })

  it('should wait with the planned account move until Claude read it', () => {
    const chat = workingTab({ moveAfterTurn: '/home/alex/.claude-gmail' })
    chat.send('t1', 'use the blue one', [], 'intoTurn')

    emit(turnEnd())
    const before = sentOps()
    emit(echo('u2', 'use the blue one'))
    emit(turnEnd())

    expect([before, sentOps()]).toEqual([['send'], ['send', 'limit_move']])
  })

  it('should take it back into the composer on a stop while Claude has not read it', async () => {
    ask.mockResolvedValue({
      type: 'control_result',
      id: 1,
      tab: 't1',
      response: { cancelled: true }
    })
    const chat = workingTab()
    chat.send('t1', 'use the blue one', [], 'intoTurn')

    await chat.interrupt('t1')

    expect([
      ask.mock.calls[0][0],
      chat.tabs[0].pending,
      useDraftStore().draftOf('t1').text,
      sentOps()
    ]).toEqual([
      {
        op: 'control',
        tab: 't1',
        request: { subtype: 'cancel_async_message', message_uuid: stampOf() }
      },
      [],
      'use the blue one',
      ['send', 'interrupt']
    ])
  })

  it('should leave it in the chat on a stop when Claude already took it', async () => {
    ask.mockResolvedValue({
      type: 'control_result',
      id: 1,
      tab: 't1',
      response: { cancelled: false }
    })
    const chat = workingTab()
    chat.send('t1', 'use the blue one', [], 'intoTurn')

    await chat.interrupt('t1')

    expect([chat.tabs[0].pending.length, useDraftStore().draftOf('t1').text]).toEqual([1, ''])
  })

  it('should give the withdrawal only a short wait so a silent Claude cannot hold up the stop', async () => {
    ask.mockResolvedValue({ type: 'control_result', id: 1, tab: 't1', response: {} })
    const chat = workingTab()
    chat.send('t1', 'use the blue one', [], 'intoTurn')

    await chat.interrupt('t1')

    expect(ask.mock.calls.at(-1)?.[2]).toBe(1500)
  })

  it('should not show a message with shell output as read before Claude came to a tool result', async () => {
    ask.mockResolvedValue({
      type: 'shell_result',
      id: 1,
      stdout: 'clean',
      stderr: '',
      code: 0,
      duration_ms: 100,
      is_timed_out: false
    })
    const chat = workingTab()
    await useShellRunsStore().start(chat.tabs[0], 'git status')
    chat.send('t1', 'commit it', [], 'intoTurn')

    emit(said('a1', 'Still on the tests.'))
    const before = chat.tabs[0].pending.length
    emit(toolResult('r1'))
    emit(said('a2', 'Committing.'))

    expect([before, chat.tabs[0].pending.length, chat.tabs[0].messages.map((m) => m.uuid)]).toEqual(
      [1, 0, ['a1', 'r1', expect.stringMatching(/^pending:/), 'a2']]
    )
  })
})
