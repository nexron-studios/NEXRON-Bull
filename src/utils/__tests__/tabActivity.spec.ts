import { describe, expect, it } from 'vitest'
import { newTab, withTurnCut, type ChatTabState } from '../chatTab'
import {
  backgroundShellsOf,
  promptTurnOf,
  shownTurnOf,
  tabActivityOf,
  toolRunsOf
} from '../tabActivity'
import type { Block, ChatMessage } from '@/types/agentd.type'

const tab = (fields: Partial<ChatTabState> = {}): ChatTabState => ({
  ...newTab({
    id: 't1',
    title: '',
    profile: null,
    account: 'default',
    cwd: 'C:\\work',
    machine: null,
    sessionId: null,
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  status: 'idle',
  ...fields
})

const at = (second: number) => `2026-11-16T10:00:${String(second).padStart(2, '0')}Z`
const ms = (second: number) => Date.parse(at(second))

const prompt = (uuid: string, second: number, isMidTurn = false): ChatMessage => ({
  uuid,
  role: 'user',
  at: at(second),
  blocks: [{ type: 'text', text: 'Build it' }],
  ...(isMidTurn ? { is_mid_turn: true } : {})
})
const call = (id: string, name: string, input: Record<string, unknown>, second: number) =>
  ({
    uuid: `c-${id}`,
    role: 'assistant',
    at: at(second),
    blocks: [{ type: 'tool_use', id, name, input }]
  }) satisfies ChatMessage
const answer = (id: string, text: string, second: number, isError = false): ChatMessage => ({
  uuid: `r-${id}`,
  role: 'user',
  at: at(second),
  blocks: [
    {
      type: 'tool_result',
      tool_use_id: id,
      is_error: isError,
      content: [{ type: 'text', text }] satisfies Block[]
    }
  ]
})
const said = (uuid: string, second: number): ChatMessage => ({
  uuid,
  role: 'assistant',
  at: at(second),
  blocks: [{ type: 'text', text: 'Done.' }]
})

describe('shownTurnOf', () => {
  it('should take the messages after the newest prompt that opened a turn', () => {
    const messages = [
      prompt('p1', 0),
      said('a1', 1),
      prompt('p2', 2),
      said('a2', 3),
      prompt('p3', 4, true),
      said('a3', 5)
    ]
    const turn = shownTurnOf(tab({ messages }))
    expect(turn.messages.map((message) => message.uuid)).toEqual(['a2', 'p3', 'a3'])
    expect(turn.startedAt).toBe(ms(2))
  })

  it('should take the running turn and its clock while Claude works', () => {
    const messages = [prompt('p1', 0), said('a1', 1), prompt('p2', 2), said('a2', 3)]
    const turn = shownTurnOf(
      tab({ messages, status: 'working', turn: { startedAt: 42, afterUuid: 'a1' } })
    )
    expect(turn.messages.map((message) => message.uuid)).toEqual(['p2', 'a2'])
    expect(turn.startedAt).toBe(42)
  })
})

describe('promptTurnOf', () => {
  it('should keep the last prompt while Claude answers a background agent on its own', () => {
    const messages = [prompt('p1', 0), said('a1', 1), said('a2', 2)]
    const turn = promptTurnOf(
      tab({
        messages,
        status: 'working',
        turn: { startedAt: 42, afterUuid: 'a1', isAgentReply: true }
      })
    )
    expect(turn.messages.map((message) => message.uuid)).toEqual(['a1', 'a2'])
    expect(turn.startedAt).toBe(ms(0))
  })

  describe('after a limit or an account move cut the turn off', () => {
    // p1 started subagents, the move cut it; p2 is the "go on" after it.
    const cut = withTurnCut(tab({ messages: [prompt('p1', 0), said('a1', 1)] }))
    const continued = [...cut.messages, prompt('p2', 5), said('a2', 6)]

    it('should keep the cut turn while the prompt after the cut continues it', () => {
      const turn = promptTurnOf({ ...cut, messages: continued })
      expect(turn.messages.map((message) => message.uuid)).toEqual(['a1', 'p2', 'a2'])
      expect(turn.startedAt).toBe(ms(0))
    })

    it('should start over with the next prompt', () => {
      const turn = promptTurnOf({ ...cut, messages: [...continued, prompt('p3', 9)] })
      expect([turn.messages, turn.startedAt]).toEqual([[], ms(9)])
    })

    it('should keep the first cut turn when the limit cuts its continuation again', () => {
      const again = withTurnCut({ ...cut, messages: continued })
      const turn = promptTurnOf({ ...again, messages: [...continued, prompt('p3', 9)] })
      expect(turn.startedAt).toBe(ms(0))
    })
  })
})

describe('toolRunsOf', () => {
  it('should give each call its status and times and leave the task tools out', () => {
    const messages = [
      call('t1', 'Read', { file_path: 'C:\\work\\src\\a.ts' }, 1),
      answer('t1', 'ok', 2),
      call('t2', 'TaskCreate', { subject: 'Plan' }, 3),
      call('t3', 'Bash', { command: 'npm test' }, 4),
      answer('t3', 'boom', 9, true),
      call('t4', 'Edit', { file_path: 'b.ts' }, 10)
    ]
    expect(toolRunsOf(messages, true)).toEqual([
      {
        id: 't1',
        name: 'Read',
        target: '…\\work\\src\\a.ts',
        status: 'done',
        startedAt: ms(1),
        finishedAt: ms(2)
      },
      {
        id: 't3',
        name: 'Bash',
        target: 'npm test',
        status: 'failed',
        startedAt: ms(4),
        finishedAt: ms(9)
      },
      {
        id: 't4',
        name: 'Edit',
        target: 'b.ts',
        status: 'running',
        startedAt: ms(10),
        finishedAt: null
      }
    ])
  })

  it('should mark a call without result as stopped once the turn is over', () => {
    const runs = toolRunsOf([call('t1', 'Bash', { command: 'sleep 9' }, 1)], false)
    expect(runs.map((run) => run.status)).toEqual(['stopped'])
  })
})

describe('tabActivityOf', () => {
  const working = (messages: ChatMessage[], fields: Partial<ChatTabState> = {}) =>
    tab({ messages, status: 'working', turn: { startedAt: ms(0), afterUuid: null }, ...fields })

  it('should show the call in progress and the last three finished ones, newest first', () => {
    const messages = [
      prompt('p1', 0),
      call('t1', 'Read', { file_path: 'a.ts' }, 1),
      answer('t1', 'ok', 2),
      call('t2', 'Grep', { pattern: 'Bull' }, 3),
      answer('t2', 'ok', 4),
      call('t3', 'Glob', { pattern: '*.vue' }, 5),
      answer('t3', 'ok', 6),
      call('t4', 'Edit', { file_path: 'b.ts' }, 7),
      answer('t4', 'ok', 8),
      call('t5', 'Bash', { command: 'npm test' }, 9)
    ]
    const view = tabActivityOf(working(messages))
    expect(view.state).toEqual({
      kind: 'running',
      phase: 'working',
      current: {
        id: 't5',
        name: 'Bash',
        target: 'npm test',
        status: 'running',
        startedAt: ms(9),
        finishedAt: null
      }
    })
    expect(view.tools.length).toBe(5)
    expect(view.recent.map((run) => run.id)).toEqual(['t4', 't3', 't2'])
  })

  it('should say Claude thinks when no call is running', () => {
    const view = tabActivityOf(working([prompt('p1', 0)], { live: { kind: 'thinking', text: '' } }))
    expect(view.state).toEqual({ kind: 'running', current: null, phase: 'thinking' })
  })

  it('should turn to waiting with the tool and its target while an approval is open', () => {
    const view = tabActivityOf(
      working([prompt('p1', 0)], {
        status: 'asking',
        permission: {
          requestId: 'r1',
          toolName: 'Bash',
          input: { command: 'git push -u origin feat/bull-brand' },
          suggestions: []
        }
      })
    )
    expect(view.state).toEqual({
      kind: 'waiting',
      reason: 'approval',
      tool: 'Bash',
      target: 'git push -u origin feat/bull-brand'
    })
  })

  it('should sum up the last turn once Claude is done', () => {
    const messages = [
      prompt('p1', 0),
      call('t1', 'Read', { file_path: 'a.ts' }, 1),
      answer('t1', 'ok', 2),
      call('t2', 'Agent', { description: 'Look', subagent_type: 'Explore' }, 3),
      answer('t2', 'found it', 40),
      said('a1', 50)
    ]
    expect(tabActivityOf(tab({ messages })).state).toEqual({
      kind: 'idle',
      summary: { tools: 2, calls: 2, subagents: 1, durationMs: 50_000, endedAt: ms(50) }
    })
  })

  it('should have nothing to sum up in a chat without messages', () => {
    expect(tabActivityOf(tab()).state).toEqual({ kind: 'idle', summary: null })
  })

  it('should say Claude thinks while it starts with a sent prompt', () => {
    const starting = tab({ status: 'starting', pending: [prompt('p1', 0)] })
    expect(tabActivityOf(starting).state).toEqual({
      kind: 'running',
      current: null,
      phase: 'thinking'
    })
  })

  it('should not list the last turn as live while a resumed chat starts with a prompt', () => {
    const messages = [prompt('p1', 0), call('t1', 'Read', { file_path: 'a.ts' }, 1), said('a1', 2)]
    const view = tabActivityOf(tab({ messages, status: 'starting', pending: [prompt('p2', 9)] }))
    expect(view).toEqual({
      state: { kind: 'running', current: null, phase: 'thinking' },
      tools: [],
      recent: []
    })
  })

  it('should have nothing running while it starts without a prompt', () => {
    expect(tabActivityOf(tab({ status: 'starting' })).state).toEqual({
      kind: 'idle',
      summary: null
    })
  })
})

describe('backgroundShellsOf', () => {
  const started = (id: string, taskId: string, command: string, second: number) => [
    call(id, 'Bash', { command, run_in_background: true }, second),
    answer(
      id,
      `Command running in background with ID: ${taskId}. Output is being written to: C:\\tmp\\${taskId}.output`,
      second
    )
  ]

  it('should list shells started in the background until they end', () => {
    const messages = [
      ...started('s1', 'b1', 'npm run dev\nsecond line', 1),
      ...started('s2', 'b2', 'npm run build', 2),
      ...started('s3', 'b3', 'cargo watch', 3),
      call('k1', 'TaskStop', { task_id: 'b3' }, 4),
      answer('k1', 'Stopped', 4),
      call('n1', 'Bash', { command: 'ls' }, 5)
    ]
    const notices = [{ id: 's2', status: 'done' as const, at: ms(6) }]
    expect(backgroundShellsOf(messages, notices, true)).toEqual([
      { id: 's1', command: 'npm run dev', description: '', startedAt: ms(1) }
    ])
  })

  it('should end a shell stopped by its old shell id', () => {
    const messages = [
      ...started('s1', 'bash_1', 'npm run dev', 1),
      call('k1', 'KillShell', { shell_id: 'bash_1' }, 2),
      answer('k1', 'Killed', 2)
    ]
    expect(backgroundShellsOf(messages, [], true)).toEqual([])
  })

  it('should keep a shell whose stop failed or has no answer yet', () => {
    const messages = [
      ...started('s1', 'b1', 'npm run dev', 1),
      ...started('s2', 'b2', 'npm run build', 2),
      call('k1', 'TaskStop', { task_id: 'b1' }, 3),
      answer('k1', 'No task found', 3, true),
      call('k2', 'TaskStop', { task_id: 'b2' }, 4)
    ]
    expect(backgroundShellsOf(messages, [], true).map((shell) => shell.id)).toEqual(['s1', 's2'])
  })

  it('should end a shell the stream no longer lists as a running task', () => {
    const messages = [
      ...started('s1', 'b1', 'npm run dev', 1),
      ...started('s2', 'b2', 'npm run build', 2)
    ]
    const tasks = { ids: ['b2', 'a7f'], active: [], at: ms(9) }
    expect(backgroundShellsOf(messages, [], true, tasks)).toEqual([
      { id: 's2', command: 'npm run build', description: '', startedAt: ms(2) }
    ])
  })

  it('should name a shell by its task in the stream, else by the description of its call', () => {
    const messages = [
      call(
        's1',
        'Bash',
        { command: 'node watch.mjs', description: 'Watch the release', run_in_background: true },
        1
      ),
      answer('s1', 'Command running in background with ID: b1. Output is being written to: x', 1),
      call(
        's2',
        'Bash',
        { command: 'node follow.mjs', description: 'Follow it', run_in_background: true },
        2
      ),
      answer('s2', 'Command running in background with ID: b2. Output is being written to: x', 2)
    ]
    const tasks = {
      ids: ['b1', 'b2'],
      active: [
        { id: 'b1', description: '' },
        { id: 'b2', description: 'Follow act video generation until done' }
      ],
      at: ms(3)
    }
    expect(backgroundShellsOf(messages, [], true, tasks).map((shell) => shell.description)).toEqual(
      ['Watch the release', 'Follow act video generation until done']
    )
  })

  it('should list nothing once Claude has exited', () => {
    expect(backgroundShellsOf(started('s1', 'b1', 'npm run dev', 1), [], false)).toEqual([])
  })

  it('should list a shell that was moved to the background while it ran', () => {
    const messages = [
      call('s3', 'Bash', { command: 'npm run e2e' }, 1),
      answer(
        's3',
        'Command was moved to the background (ID: beugxf82k). Output is being written to: x',
        2
      )
    ]
    expect(backgroundShellsOf(messages, [], true)).toEqual([
      { id: 's3', command: 'npm run e2e', description: '', startedAt: ms(1) }
    ])
  })

  it('should not take the output of a foreground command for a background shell', () => {
    const messages = [
      call('s4', 'Bash', { command: './start.sh' }, 1),
      answer('s4', 'Started in background (ID: 42)', 2)
    ]
    expect(backgroundShellsOf(messages, [], true)).toEqual([])
  })

  it('should skip a background call whose start failed', () => {
    const messages = [
      call('s1', 'Bash', { command: 'npm run dev', run_in_background: true }, 1),
      answer('s1', 'denied', 2, true)
    ]
    expect(backgroundShellsOf(messages, [], true)).toEqual([])
  })
})
