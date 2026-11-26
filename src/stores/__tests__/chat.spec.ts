import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { AgentdEvent } from '@/types/agentd.type'
import { useConnectorSetupStore } from '@/stores/connectorSetup'
import { AgentdDisconnectedError } from '@/api/services/agentd.service'
import { newTab } from '@/utils/chatTab'
import { useChatStore } from '../chat'

const { ask, send, listeners, runtime, ready } = vi.hoisted(() => ({
  ask: vi.fn(),
  send: vi.fn(() => Promise.resolve()),
  listeners: [] as ((event: AgentdEvent) => void)[],
  /** The app window by default; the browser tests switch it off. */
  runtime: { isDesktopApp: true },
  /** What the transport calls once the app may attach; the tests decide when. */
  ready: [] as ((machines: (string | null)[]) => void)[]
}))

vi.mock('@/lib/platform', () => ({ isDesktopApp: () => runtime.isDesktopApp }))

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: {
    ask,
    send,
    waitFor: vi.fn(),
    onEvent: (listener: (event: AgentdEvent) => void) => {
      listeners.push(listener)
      return () => {}
    },
    onReady: (listener: (machines: (string | null)[]) => void) => {
      ready.push(listener)
      return () => {}
    }
  }
}))

const LOCAL_LOST =
  'Verbindung zu Claude auf diesem PC getrennt. Claude läuft im Hintergrund weiter, die App verbindet sich neu.'

const liveTab = (id: string, machine: string | null) => ({
  ...newTab({
    id,
    title: id,
    profile: null,
    account: 'office',
    cwd: 'C:\\work',
    machine,
    sessionId: null,
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  status: 'idle' as const
})

const emit = (event: AgentdEvent) => listeners.forEach((listener) => listener(event))

describe('useChatStore: background work', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listeners.length = 0
  })

  it('should forget the background tasks of a Claude that exited', () => {
    const chat = useChatStore()
    chat.tabs = [
      {
        ...liveTab('t1', null),
        backgroundTasks: {
          active: [{ id: 'a7f', description: '', kind: 'agent' }],
          at: 1,
          agentsSince: null
        }
      }
    ]

    emit({ type: 'exited', tab: 't1', code: 0 })

    expect(chat.tabs[0].backgroundTasks?.active).toEqual([])
  })

  it('should finish the turn and keep the name of the shell it left running', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(9000)
    const chat = useChatStore()
    chat.tabs = [
      { ...liveTab('t1', null), status: 'working', turn: { startedAt: 1, afterUuid: null } }
    ]

    emit({
      type: 'claude',
      tab: 't1',
      event: {
        type: 'system',
        subtype: 'background_tasks_changed',
        tasks: [
          {
            task_id: 'b3vtm9fpi',
            task_type: 'local_bash',
            description: 'Follow act video generation until done'
          }
        ]
      }
    })
    emit({ type: 'claude', tab: 't1', event: { type: 'result', subtype: 'success' } })

    const [tab] = chat.tabs
    vi.useRealTimers()
    expect([tab.status, tab.finishedAt, tab.backgroundTasks?.active]).toEqual([
      'idle',
      9000,
      [{ id: 'b3vtm9fpi', description: 'Follow act video generation until done', kind: 'shell' }]
    ])
  })
})

describe('useChatStore: lost connection to this computer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    i18n.global.locale.value = 'de'
    listeners.length = 0
    ask.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should end only the local tabs and tell why', () => {
    const chat = useChatStore()
    chat.tabs = [liveTab('local', null), liveTab('remote', 'nexron-server')]

    emit({ type: 'disconnected', machine: null, connection: 1 })

    expect(chat.tabs.map((tab) => [tab.id, tab.status, tab.notice])).toEqual([
      ['local', 'ended', LOCAL_LOST],
      ['remote', 'idle', null]
    ])
  })

  it('should ask this computer again which tabs run and clear the notice', async () => {
    ask.mockResolvedValue({ type: 'running', id: 1, tabs: [] })
    const chat = useChatStore()
    chat.tabs = [liveTab('local', null)]

    emit({ type: 'disconnected', machine: null, connection: 1 })
    await vi.advanceTimersByTimeAsync(250)

    expect(ask).toHaveBeenCalledWith({ op: 'running' }, null)
    expect(chat.tabs[0].notice).toBe(null)
  })

  // The service rejects the request and then reports the lost connection: one try, not two.
  it('should try once per round while the machine stays unreachable', async () => {
    ask.mockImplementation(
      () =>
        new Promise((_, reject) =>
          queueMicrotask(() => {
            reject(new AgentdDisconnectedError(null))
            emit({ type: 'disconnected', machine: null, connection: 1 })
          })
        )
    )
    const chat = useChatStore()
    chat.tabs = [liveTab('local', null)]

    emit({ type: 'disconnected', machine: null, connection: 1 })
    // Backoff 250, 500, 1000 ms: three failed tries, then exactly one more waiting.
    await vi.advanceTimersByTimeAsync(250 + 500 + 1000)

    expect(ask).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('should drop the waiting try once the tabs attached another way', async () => {
    ask.mockResolvedValue({ type: 'running', id: 1, tabs: [] })
    const chat = useChatStore()
    chat.tabs = [liveTab('local', null)]

    emit({ type: 'disconnected', machine: null, connection: 1 })
    // The app window says once that it may attach; the newest store is this test's.
    ready.at(-1)?.([])
    await vi.advanceTimersByTimeAsync(250)

    expect(ask).toHaveBeenCalledTimes(1)
  })
})

describe('useChatStore: approvals, retries and Ctrl+B', () => {
  const asking = () => ({
    ...liveTab('t1', null),
    status: 'asking' as const,
    permission: {
      requestId: 'r1',
      toolName: 'Bash',
      input: { command: 'git push' },
      suggestions: []
    }
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    listeners.length = 0
    send.mockClear()
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should tell Claude why the user turned a call down', () => {
    const chat = useChatStore()
    chat.tabs = [asking()]

    chat.answer('t1', false, '  Not before the review.  ')

    expect(send).toHaveBeenCalledWith(
      {
        op: 'permission',
        tab: 't1',
        request_id: 'r1',
        decision: {
          behavior: 'deny',
          message:
            'The user denied this tool use and said what to do instead: Not before the review.'
        }
      },
      null
    )
  })

  it('should deny with the plain message when no reason was typed', () => {
    const chat = useChatStore()
    chat.tabs = [asking()]

    chat.answer('t1', false)

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: { behavior: 'deny', message: 'The user denied this tool use.' }
      }),
      null
    )
  })

  it('should show a retry Claude Code announced with the time of the next attempt', () => {
    const chat = useChatStore()
    chat.tabs = [{ ...liveTab('t1', null), status: 'working' as const }]

    emit({
      type: 'claude',
      tab: 't1',
      event: {
        type: 'system',
        subtype: 'api_retry',
        attempt: 2,
        max_retries: 10,
        retry_delay_ms: 8000,
        error_status: 529,
        error: 'overloaded'
      }
    })

    expect(chat.tabs[0]?.retry).toEqual({
      attempt: 2,
      maxRetries: 10,
      status: 529,
      reason: 'overloaded',
      retriesAt: 18_000
    })
  })

  it('should send a running call to the background', () => {
    const chat = useChatStore()
    chat.tabs = [liveTab('t1', null)]

    void chat.sendToBackground('t1', 'toolu_7')

    expect(send).toHaveBeenCalledWith({ op: 'background', tab: 't1', tool_use_id: 'toolu_7' }, null)
  })
})

describe('useChatStore: connectors after claude mcp add', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listeners.length = 0
    ask.mockReset()
  })

  it('should have Claude read its MCP config again, refused while a turn runs', async () => {
    ask.mockResolvedValueOnce({ type: 'control_result', id: 1, tab: 't1', response: {} })
    const chat = useChatStore()
    chat.tabs = [liveTab('t1', null)]

    await chat.reloadMcpConfig('t1')

    expect(ask).toHaveBeenCalledWith(
      { op: 'control', tab: 't1', request: { subtype: 'reload_plugins', refuse_if_busy: true } },
      null,
      70_000
    )
  })

  it('should show the servers mcp_status lists', async () => {
    ask.mockResolvedValueOnce({
      type: 'control_result',
      id: 2,
      tab: 't1',
      response: { mcpServers: [{ name: 'probe', status: 'connected', scope: 'user' }] }
    })
    const chat = useChatStore()
    chat.tabs = [{ ...liveTab('t1', null), connectors: [] }]

    const connectors = await chat.refreshConnectors('t1')

    expect(ask).toHaveBeenCalledWith(
      { op: 'control', tab: 't1', request: { subtype: 'mcp_status' } },
      null,
      70_000
    )
    expect(connectors).toEqual([{ name: 'probe', status: 'connected' }])
    expect(chat.tabs[0].connectors).toEqual([{ name: 'probe', status: 'connected' }])
  })

  it('should keep a list that a turn reported while mcp_status was asked', async () => {
    let answer: (value: unknown) => void = () => {}
    ask.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const chat = useChatStore()
    chat.tabs = [{ ...liveTab('t1', null), connectors: [] }]

    const refreshed = chat.refreshConnectors('t1')
    emit({
      type: 'claude',
      tab: 't1',
      event: {
        type: 'system',
        subtype: 'init',
        mcp_servers: [{ name: 'figma', status: 'connected' }]
      }
    })
    answer({ type: 'control_result', id: 3, tab: 't1', response: { mcpServers: [] } })
    await refreshed

    expect(chat.tabs[0].connectors).toEqual([{ name: 'figma', status: 'connected' }])
  })

  it('should forget the connector setup of a closed tab', () => {
    const chat = useChatStore()
    chat.tabs = [{ ...liveTab('t1', null), status: 'ended' }]
    const setups = useConnectorSetupStore()
    setups.set('t1', 'restart')

    chat.close('t1')

    expect(setups.setups).toEqual({})
  })
})

describe('useChatStore: closing and reopening a session', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ask.mockReset()
    send.mockClear()
  })

  const session = {
    session_id: 's1',
    profile: 'office',
    account: 'office',
    cwd: 'C:\\work',
    title: 'say ok',
    modified_ms: 0
  }

  it('should reopen a closed session with the mode, model and effort it had', () => {
    const chat = useChatStore()
    chat.resume(session, null)
    const opened = chat.tabs[0]
    chat.tabs = [{ ...opened, model: 'opus', effort: 'xhigh', permissionMode: 'auto' }]

    chat.close(opened.id)
    chat.resume(session, null)

    const { model, effort, permissionMode } = chat.tabs[0]
    expect({ model, effort, permissionMode }).toEqual({
      model: 'opus',
      effort: 'xhigh',
      permissionMode: 'auto'
    })
  })

  it('should keep the settings of the session /clear left behind', () => {
    const chat = useChatStore()
    chat.resume(session, null)
    const opened = chat.tabs[0]
    chat.tabs = [{ ...opened, status: 'idle', effort: 'xhigh', permissionMode: 'auto' }]

    emit({
      type: 'claude',
      tab: opened.id,
      event: { type: 'system', subtype: 'init', session_id: 's1-cleared' }
    })
    chat.close(opened.id)
    chat.resume(session, null)

    const { model, effort, permissionMode } = chat.tabs[0]
    expect({ model, effort, permissionMode }).toEqual({
      model: null,
      effort: 'xhigh',
      permissionMode: 'auto'
    })
  })

  it('should open a session never set in Bull on the account defaults', () => {
    const chat = useChatStore()

    chat.resume({ ...session, session_id: 's2' }, null)

    const { model, effort, permissionMode } = chat.tabs[0]
    expect({ model, effort, permissionMode }).toEqual({
      model: null,
      effort: null,
      permissionMode: null
    })
  })
})

describe('useChatStore: switching the account', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ask.mockReset()
    send.mockClear()
  })

  const gmail = { label: 'gmail', dir: 'C:/Users/me/.claude-gmail', email: null }

  const stoppedTab = (isFresh: boolean) => ({
    ...newTab({
      id: 't1',
      title: isFresh ? '' : 'say ok',
      profile: 'C:/Users/me/.claude-office',
      account: 'office',
      cwd: 'C:/work',
      machine: null,
      sessionId: 's1',
      model: null,
      permissionMode: null,
      isFresh
    }),
    status: 'ended' as const
  })

  it('should tell agentd that a chat without a first message may have nothing to copy', async () => {
    ask.mockResolvedValue({ type: 'moved', id: 1, session_id: 's1' })
    const chat = useChatStore()
    chat.tabs = [stoppedTab(true)]

    await chat.switchAccount('t1', gmail)

    expect(ask).toHaveBeenCalledWith(
      {
        op: 'move_session',
        from: 'C:/Users/me/.claude-office',
        to: gmail.dir,
        session_id: 's1',
        is_fresh: true
      },
      null
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'start', profile: gmail.dir, resume: 's1', is_fresh: true }),
      null
    )
  })

  it('should list the chat as before the move until Claude runs in the other account', async () => {
    ask.mockResolvedValue({ type: 'moved', id: 1, session_id: 's1' })
    const chat = useChatStore()
    chat.tabs = [{ ...stoppedTab(false), status: 'idle' as const }]

    await chat.switchAccount('t1', gmail)

    expect([chat.tabs[0].status, chat.tabs[0].statusBeforeMove]).toEqual(['starting', 'idle'])
  })

  describe('the turn shown in the panel', () => {
    const prompt = {
      uuid: 'p1',
      role: 'user' as const,
      at: null,
      blocks: [{ type: 'text' as const, text: 'Build it' }]
    }

    it('should keep a turn the move interrupted for the other account', async () => {
      ask.mockResolvedValue({ type: 'moved', id: 1, session_id: 's1' })
      const chat = useChatStore()
      chat.tabs = [{ ...stoppedTab(false), status: 'working' as const, messages: [prompt] }]

      await chat.switchAccount('t1', gmail)

      expect(chat.tabs[0].cutTurn).toEqual({ promptUuid: 'p1', promptsAfter: 0 })
    })

    it('should not hold a finished turn: the next prompt is something new', async () => {
      ask.mockResolvedValue({ type: 'moved', id: 1, session_id: 's1' })
      const chat = useChatStore()
      chat.tabs = [{ ...stoppedTab(false), status: 'idle' as const, messages: [prompt] }]

      await chat.switchAccount('t1', gmail)

      expect(chat.tabs[0].cutTurn).toBe(null)
    })
  })

  it('should ignore a second switch while the first one runs', async () => {
    const chat = useChatStore()
    chat.tabs = [{ ...stoppedTab(false), statusBeforeMove: 'idle' as const }]

    await chat.switchAccount('t1', gmail)

    expect(ask).not.toHaveBeenCalled()
  })

  it('should list the chat as it is again when the move fails', async () => {
    ask.mockRejectedValue(new Error('target profile locked'))
    const chat = useChatStore()
    chat.tabs = [stoppedTab(false)]

    await chat.switchAccount('t1', gmail)

    expect([chat.tabs[0].account, chat.tabs[0].statusBeforeMove]).toEqual(['office', null])
  })

  it('should move a chat with messages as one that has a transcript', async () => {
    ask.mockResolvedValue({ type: 'moved', id: 1, session_id: 's1' })
    const chat = useChatStore()
    chat.tabs = [stoppedTab(false)]

    await chat.switchAccount('t1', gmail)

    expect(ask).toHaveBeenCalledWith(
      {
        op: 'move_session',
        from: 'C:/Users/me/.claude-office',
        to: gmail.dir,
        session_id: 's1',
        is_fresh: false
      },
      null
    )
  })
})

describe('useChatStore: in a browser through the bridge', () => {
  const running = {
    tab: 't9',
    session_id: 's9',
    title: 'Fix the cart',
    cwd: 'C:\work\shop',
    profile: null,
    account: 'office',
    model: 'haiku',
    permission_mode: 'default',
    effort: null,
    is_fresh: false
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    listeners.length = 0
    ready.length = 0
    ask.mockReset()
    send.mockClear()
    localStorage.clear()
    runtime.isDesktopApp = false
    ask.mockImplementation(async (message: { op: string }, machine: string | null) => {
      if (message.op === 'tabs') return { type: 'tabs', id: 1, tabs: machine ? [] : [running] }
      return { type: 'history', id: 2, messages: [], has_more: false }
    })
  })

  afterEach(() => {
    runtime.isDesktopApp = true
  })

  it('should wait for the bridge before it attaches anything', async () => {
    useChatStore()
    await Promise.resolve()

    expect(ask).not.toHaveBeenCalled()
  })

  it('should open and attach the tabs another app runs, on every machine the bridge reaches', async () => {
    const chat = useChatStore()

    ready.forEach((attach) => attach([null, 'main-pc']))
    await vi.waitFor(() => expect(send).toHaveBeenCalled())

    expect(ask).toHaveBeenCalledWith({ op: 'tabs' }, null)
    expect(ask).toHaveBeenCalledWith({ op: 'tabs' }, 'main-pc')
    expect(chat.tabs.map((tab) => [tab.id, tab.machine, tab.sessionId, tab.title])).toEqual([
      ['t9', null, 's9', 'Fix the cart']
    ])
    expect(send).toHaveBeenCalledWith(
      {
        op: 'start',
        tab: 't9',
        profile: null,
        cwd: 'C:\work\shop',
        resume: 's9',
        model: 'haiku',
        permission_mode: 'default',
        is_fresh: false,
        effort: null,
        worktree: null
      },
      null
    )
  })

  it('should ask once while an attach to the machine is still under way', async () => {
    useChatStore()

    ready.forEach((attach) => attach([null]))
    ready.forEach((attach) => attach([null]))
    await vi.waitFor(() => expect(send).toHaveBeenCalled())

    expect(ask.mock.calls.filter(([message]) => message.op === 'tabs')).toHaveLength(1)
  })

  /** Signed in with nothing running yet; `running` then starts on the local agentd. */
  const attachedEmpty = async () => {
    const chat = useChatStore()
    const later = running
    let isFirst = true
    ask.mockImplementation(async (message: { op: string }, machine: string | null) => {
      if (message.op !== 'tabs') return { type: 'history', id: 2, messages: [], has_more: false }
      const tabs = isFirst || machine ? [] : [later]
      if (!machine) isFirst = false
      return { type: 'tabs', id: 1, tabs }
    })
    ready.forEach((attach) => attach([null, 'main-pc']))
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(2))
    // The attach marks the machines once their answers are in.
    await new Promise((resolve) => setTimeout(resolve))
    ask.mockClear()
    return chat
  }

  it('should open a tab another app starts while this one is open', async () => {
    const chat = await attachedEmpty()

    emit({ type: 'started', id: null, tab: 't9', session_id: 's9', working: false })
    await vi.waitFor(() => expect(chat.tabs.map((tab) => tab.id)).toEqual(['t9']))

    expect(ask).toHaveBeenCalledWith({ op: 'tabs' }, null)
  })

  it('should still open the new tab when another machine went away meanwhile', async () => {
    const chat = await attachedEmpty()
    ask.mockImplementation(async (message: { op: string }, machine: string | null) => {
      if (machine) throw new AgentdDisconnectedError(machine)
      if (message.op === 'tabs') return { type: 'tabs', id: 1, tabs: [running] }
      return { type: 'history', id: 2, messages: [], has_more: false }
    })

    emit({ type: 'started', id: null, tab: 't9', session_id: 's9', working: false })

    await vi.waitFor(() => expect(chat.tabs.map((tab) => tab.id)).toEqual(['t9']))
  })

  it('should leave a tab closed here closed, and its Claude to the app that started it', async () => {
    const chat = useChatStore()
    ready.forEach((attach) => attach([null]))
    await vi.waitFor(() => expect(chat.tabs.map((tab) => tab.id)).toEqual(['t9']))
    send.mockClear()

    chat.close('t9')
    ready.forEach((attach) => attach([null]))
    await vi.waitFor(() => expect(ask.mock.calls.filter(([m]) => m.op === 'tabs')).toHaveLength(2))

    expect([chat.tabs, send.mock.calls]).toEqual([[], []])
  })

  it('should open a tab once when two starts of it arrive before the first answer', async () => {
    const chat = await attachedEmpty()

    emit({ type: 'started', id: null, tab: 't9', session_id: 's9', working: false })
    emit({ type: 'started', id: null, tab: 't9', session_id: 's9', working: false })
    await vi.waitFor(() => expect(send).toHaveBeenCalled())

    expect(chat.tabs.map((tab) => tab.id)).toEqual(['t9'])
  })
})

describe('useChatStore: tabs in finish order', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listeners.length = 0
  })

  const finishedTab = (id: string, finishedAt: number) => ({
    ...liveTab(id, null),
    finishedAt
  })

  it('should line finished chats up newest first, seen or not, and keep a later drag', () => {
    const chat = useChatStore()
    chat.tabs = [finishedTab('a', 1), finishedTab('b', 2), finishedTab('c', 3)]

    chat.markUnseen('b', 2)
    chat.lineUpByFinish('b', 2)
    chat.lineUpByFinish('c', 3)
    const afterFinishing = chat.tabs.map((tab) => tab.id)
    chat.reorder(['a', 'c', 'b'])

    expect([afterFinishing, chat.tabs.map((tab) => tab.id)]).toEqual([
      ['c', 'b', 'a'],
      ['a', 'c', 'b']
    ])
  })

  it('should put a chat watched while it finished before an older unseen one', () => {
    const chat = useChatStore()
    chat.tabs = [finishedTab('unseen', 1), finishedTab('watched', 2)]
    chat.markUnseen('unseen', 1)

    chat.lineUpByFinish('watched', 2)

    expect(chat.tabs.map((tab) => tab.id)).toEqual(['watched', 'unseen'])
  })

  it('should leave the order alone when the chat went on before it was lined up', () => {
    const chat = useChatStore()
    chat.tabs = [finishedTab('a', 1), finishedTab('b', 5)]

    chat.lineUpByFinish('b', 2)

    expect(chat.tabs.map((tab) => tab.id)).toEqual(['a', 'b'])
  })

  it('should keep the tab bar number of a chat once it was seen', () => {
    const chat = useChatStore()
    chat.tabs = [finishedTab('a', 1), finishedTab('b', 2)]
    chat.markUnseen('b', 2)

    chat.markSeen('b')

    expect([[...chat.tabFinishRanks], [...chat.finishRanks]]).toEqual([
      [
        ['b', 1],
        ['a', 2]
      ],
      []
    ])
  })
})
