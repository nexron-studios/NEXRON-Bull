import { describe, expect, it } from 'vitest'
import {
  applyEvent,
  listedTabOf,
  newTab,
  savedTabOf,
  stampArrival,
  withAgentNotices,
  withHistory,
  withNewSession,
  withoutPending,
  withPendingPrompt,
  withTurnClock,
  type ChatTabState,
  type SavedTab
} from '../chatTab'
import type { ChatMessage } from '@/types/agentd.type'
import { pendingMessageOf } from '../pendingPrompts'

const tab = (): ChatTabState =>
  newTab({
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
  })

const message = (uuid: string, role: ChatMessage['role'], text: string): ChatMessage => ({
  uuid,
  role,
  at: null,
  blocks: [{ type: 'text', text }]
})

describe('newTab', () => {
  it('should mark a new session as loaded, there is no transcript to read', () => {
    expect(tab().history).toBe('loaded')
  })

  it('should treat a tab saved before the fresh flag by its title', () => {
    // As the store reads it back from localStorage.
    const saved: SavedTab = JSON.parse(
      '{"id":"t1","title":"","profile":null,"account":"default","cwd":"C:\\\\work","machine":null,"sessionId":"s1","model":null,"permissionMode":null}'
    )
    expect([newTab(saved).isFresh, newTab({ ...saved, title: 'Export' }).isFresh]).toEqual([
      true,
      false
    ])
  })

  it('should keep the place in the finish order across a restart', () => {
    const saved = JSON.parse(JSON.stringify(savedTabOf({ ...tab(), unseenAt: 5000 }))) as SavedTab
    expect(newTab(saved).unseenAt).toBe(5000)
  })

  it('should keep the context window across a restart', () => {
    const saved = JSON.parse(
      JSON.stringify(savedTabOf({ ...tab(), contextWindow: 1_000_000 }))
    ) as SavedTab
    expect(newTab(saved).contextWindow).toBe(1_000_000)
  })

  it('should leave the window unknown for a tab saved before it was kept', () => {
    expect(newTab(tab()).contextWindow).toBe(null)
  })

  it('should not trust a saved window it cannot divide by', () => {
    expect(newTab({ ...tab(), contextWindow: 0 }).contextWindow).toBe(null)
  })

  it('should give a tab saved before the finish order no place in it', () => {
    expect(newTab(tab()).unseenAt).toBe(null)
  })

  it('should leave the history of a resumed session unread', () => {
    expect(newTab({ ...tab(), sessionId: 's1' }).history).toBe('none')
  })

  it('should keep a tab saved before muting existed audible', () => {
    expect(tab().isMuted).toBe(false)
  })

  it('should keep a muted tab muted', () => {
    expect(newTab({ ...tab(), isMuted: true }).isMuted).toBe(true)
  })
})

describe('savedTabOf', () => {
  it('should save whether the tab is muted', () => {
    expect(savedTabOf({ ...tab(), isMuted: true }).isMuted).toBe(true)
  })
})

const delta = (text: string) => ({
  type: 'claude' as const,
  tab: 't1',
  event: {
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } }
  }
})

describe('applyEvent', () => {
  it('should take the title Haiku gave the session', () => {
    const running = { ...tab(), sessionId: 's1', title: 'mach mal die tabs' }

    const next = applyEvent(running, {
      type: 'title',
      tab: 't1',
      session_id: 's1',
      title: 'Tab-Wechsel'
    })

    expect(next.title).toBe('Tab-Wechsel')
  })

  it('should keep its title when the named session was replaced by /clear', () => {
    const cleared = { ...tab(), sessionId: 's2', title: '' }

    const next = applyEvent(cleared, {
      type: 'title',
      tab: 't1',
      session_id: 's1',
      title: 'Tab-Wechsel'
    })

    expect(next.title).toBe('')
  })

  it('should become idle with the session id once Claude started', () => {
    const next = applyEvent(tab(), {
      type: 'started',
      id: 1,
      tab: 't1',
      session_id: 's1',
      working: false
    })
    expect([next.status, next.sessionId]).toEqual(['idle', 's1'])
  })

  it('should show Claude as working when it attached to a session in the middle of a turn', () => {
    const next = applyEvent(tab(), {
      type: 'started',
      id: 1,
      tab: 't1',
      session_id: 's1',
      working: true
    })
    expect(next.status).toBe('working')
  })

  it('should collect streamed text and drop it when the full message arrives', () => {
    const streaming = applyEvent(applyEvent(tab(), delta('Hal')), delta('lo'))
    expect([streaming.streaming, streaming.status]).toEqual(['Hallo', 'working'])

    const done = applyEvent(streaming, {
      type: 'message',
      tab: 't1',
      message: message('a1', 'assistant', 'Hallo')
    })
    expect([done.streaming, done.messages.length]).toEqual(['', 1])
  })

  it('should title the tab after the first prompt and ignore a repeated message', () => {
    const prompt = {
      type: 'message' as const,
      tab: 't1',
      message: message('u1', 'user', 'Baue den Export')
    }
    const next = applyEvent(applyEvent(tab(), prompt), prompt)
    expect([next.title, next.messages.length]).toEqual(['Baue den Export', 1])
  })

  it('should open a permission ask for can_use_tool', () => {
    const next = applyEvent(tab(), {
      type: 'claude',
      tab: 't1',
      event: {
        type: 'control_request',
        request_id: 'r1',
        request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: 'a.txt' } }
      }
    })
    expect([next.status, next.permission]).toEqual([
      'asking',
      { requestId: 'r1', toolName: 'Write', input: { file_path: 'a.txt' }, suggestions: [] }
    ])
  })

  it('should keep the rules Claude suggests to remember with an allow', () => {
    const rule = {
      type: 'addRules',
      rules: [{ toolName: 'Bash', ruleContent: 'git push:*' }],
      behavior: 'allow',
      destination: 'localSettings'
    }
    const next = applyEvent(tab(), {
      type: 'claude',
      tab: 't1',
      event: {
        type: 'control_request',
        request_id: 'r2',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Bash',
          input: { command: 'git push' },
          permission_suggestions: [rule]
        }
      }
    })
    expect(next.permission?.suggestions).toEqual([rule])
  })

  it('should show a limit message as notice but not an interrupted turn', () => {
    const result = (text: string) => ({
      type: 'claude' as const,
      tab: 't1',
      event: { type: 'result', is_error: true, result: text }
    })
    expect(applyEvent(tab(), result('You have hit your limit')).notice).toBe(
      'You have hit your limit'
    )
    expect(applyEvent(tab(), result('')).notice).toBe(null)
  })

  it('should end the tab when Claude exits', () => {
    expect(applyEvent(tab(), { type: 'exited', tab: 't1', code: 0 }).status).toBe('ended')
  })

  it('should keep streamed reasoning until its message arrives', () => {
    const stream = (event: Record<string, unknown>) => ({
      type: 'claude' as const,
      tab: 't1',
      event: { type: 'stream_event', event: event as { type: string } }
    })
    const started = applyEvent(
      tab(),
      stream({ type: 'content_block_start', content_block: { type: 'thinking', thinking: '' } })
    )
    const thinking = applyEvent(
      started,
      stream({
        type: 'content_block_delta',
        delta: { type: 'thinking_delta', thinking: 'Erst lesen' }
      })
    )
    const stopped = applyEvent(thinking, stream({ type: 'content_block_stop' }))
    const landed = applyEvent(stopped, {
      type: 'message',
      tab: 't1',
      message: {
        uuid: 'a1',
        role: 'assistant',
        at: null,
        blocks: [{ type: 'thinking', text: 'Erst lesen' }]
      }
    })
    expect([started.thinking, stopped.thinking, landed.thinking]).toEqual(['', 'Erst lesen', null])
  })

  it('should mark a prompt that arrives after Claude answered in the running turn', () => {
    const running = {
      ...tab(),
      status: 'working' as const,
      turn: { startedAt: 0, afterUuid: 'u1' },
      messages: [message('u1', 'user', 'Baue den Export'), message('a1', 'assistant', 'Lese …')]
    }
    const next = applyEvent(running, {
      type: 'message',
      tab: 't1',
      message: message('u2', 'user', 'Auch als CSV')
    })
    expect(next.messages.at(-1)?.is_mid_turn).toBe(true)
  })

  it('should not mark the prompt that starts a turn', () => {
    const starting = {
      ...tab(),
      status: 'working' as const,
      turn: { startedAt: 0, afterUuid: null }
    }
    const next = applyEvent(starting, {
      type: 'message',
      tab: 't1',
      message: message('u1', 'user', 'Baue den Export')
    })
    expect(next.messages.at(-1)?.is_mid_turn).toBeUndefined()
  })
})

describe('applyEvent error', () => {
  it('should end a tab whose start failed, so the next prompt starts it again', () => {
    const next = applyEvent(tab(), {
      type: 'error',
      id: null,
      tab: 't1',
      message: 'claude not found on PATH'
    })
    expect([next.status, next.notice]).toEqual(['ended', 'claude not found on PATH'])
  })
})

describe('a chat moving to another account', () => {
  const moving = (): ChatTabState => ({ ...tab(), status: 'starting', statusBeforeMove: 'idle' })

  it('should be listed with the status it had before the move', () => {
    expect(listedTabOf(moving()).status).toBe('idle')
  })

  it('should be listed as it is once Claude runs in the other account', () => {
    const started = applyEvent(moving(), {
      type: 'started',
      id: null,
      tab: 't1',
      session_id: 's1',
      working: false
    })
    expect([started.statusBeforeMove, listedTabOf(started).status]).toEqual([null, 'idle'])
  })

  it('should be listed as it is when Claude exits there before it started', () => {
    const exited = applyEvent(moving(), { type: 'exited', tab: 't1', code: 1 })
    expect([exited.statusBeforeMove, listedTabOf(exited).status]).toEqual([null, 'ended'])
  })

  it('should be listed as it is when Claude fails to start there', () => {
    const failed = applyEvent(moving(), { type: 'error', id: null, tab: 't1', message: 'no login' })
    expect([failed.statusBeforeMove, listedTabOf(failed).status]).toEqual([null, 'ended'])
  })
})

describe('stampArrival', () => {
  it('should give a message without timestamp the time it arrived', () => {
    const event = { type: 'message' as const, tab: 't1', message: message('a1', 'assistant', 'Hi') }
    expect(stampArrival(event, Date.UTC(2026, 10, 15, 10, 0, 12))).toMatchObject({
      message: { at: '2026-11-15T10:00:12.000Z' }
    })
  })

  it('should keep the timestamp Claude Code wrote', () => {
    const stamped = { ...message('a1', 'assistant', 'Hi'), at: '2026-11-15T09:00:00Z' }
    const event = { type: 'message' as const, tab: 't1', message: stamped }
    expect(stampArrival(event, 0)).toEqual(event)
  })
})

describe('applyEvent with a subagent', () => {
  it('should ignore text a subagent streams', () => {
    const next = applyEvent(tab(), {
      type: 'claude',
      tab: 't1',
      event: { ...delta('intern').event, parent_tool_use_id: 'toolu_1' }
    })
    expect(next.streaming).toBe('')
  })
})

describe('withTurnClock', () => {
  it('should start the clock when a turn begins and keep it while it runs', () => {
    const working = withTurnClock({ ...tab(), status: 'working' }, 1000)
    expect(withTurnClock({ ...working, status: 'asking' }, 5000).turn).toEqual({
      startedAt: 1000,
      afterUuid: null
    })
  })

  it('should clear the clock once Claude is idle', () => {
    const turn = { startedAt: 1000, afterUuid: null }
    expect(withTurnClock({ ...tab(), status: 'idle', turn }, 5000).turn).toBe(null)
  })

  it('should note when an answered turn ended', () => {
    const turn = { startedAt: 1000, afterUuid: null }
    expect(withTurnClock({ ...tab(), status: 'idle', turn }, 5000).finishedAt).toBe(5000)
  })

  it('should not call a crash or an error result finished', () => {
    const turn = { startedAt: 1000, afterUuid: null }
    const crashed = withTurnClock({ ...tab(), status: 'ended', turn }, 5000)
    const failed = withTurnClock({ ...tab(), status: 'idle', notice: 'usage limit', turn }, 5000)
    expect([crashed.finishedAt, crashed.turn, failed.finishedAt]).toEqual([null, null, null])
  })

  it('should take a finished chat out of the finish order once a new turn starts', () => {
    expect(withTurnClock({ ...tab(), status: 'working', unseenAt: 5000 }, 9000).unseenAt).toBe(null)
  })
})

describe('a subagent report', () => {
  const report = (uuid: string): ChatMessage => ({
    uuid,
    role: 'system',
    at: null,
    blocks: [
      {
        type: 'agent_message',
        from: 'a444',
        name: 'Explore',
        text: 'Ping finished.',
        is_report: true
      }
    ]
  })
  const arrived = (state: ChatTabState, uuid: string) =>
    applyEvent(state, { type: 'message', tab: 't1', message: report(uuid) })
  const answered = { ...tab(), finishedAt: 5000, unseenAt: 5000 }

  it('should keep the finish place when Claude takes up a report on its own', () => {
    const working = withTurnClock({ ...arrived(answered, 'r1'), status: 'working' }, 9000)
    expect([working.turn, working.unseenAt]).toEqual([
      { startedAt: 9000, afterUuid: 'r1', isAgentReply: true },
      5000
    ])
  })

  it('should not call the reply to a report a finished turn', () => {
    const working = withTurnClock({ ...arrived(answered, 'r1'), status: 'working' }, 9000)
    const idle = withTurnClock({ ...working, status: 'idle' }, 12000)
    expect([idle.turn, idle.finishedAt]).toEqual([null, 5000])
  })

  it('should mark a turn that started before its report arrived', () => {
    const working = withTurnClock({ ...answered, status: 'working' }, 9000)
    expect(withTurnClock(arrived(working, 'r1'), 9500).turn).toEqual({
      startedAt: 9000,
      afterUuid: null,
      isAgentReply: true
    })
  })

  it('should leave a turn the user started to the user', () => {
    const sent = withPendingPrompt(
      answered,
      pendingMessageOf([{ type: 'text', text: 'Weiter' }], 'x1', 9000, false)
    )
    const working = withTurnClock({ ...arrived(sent, 'r1'), status: 'working' }, 9000)
    expect([working.turn?.isAgentReply, working.unseenAt]).toEqual([undefined, null])
  })

  it('should hand the turn to the user once they send something into it', () => {
    const working = withTurnClock({ ...arrived(answered, 'r1'), status: 'working' }, 9000)
    const replied = applyEvent(working, {
      type: 'message',
      tab: 't1',
      message: message('a1', 'assistant', 'Reading the report')
    })
    const typed = withTurnClock(
      applyEvent(replied, { type: 'message', tab: 't1', message: message('u2', 'user', 'Und?') }),
      10000
    )
    const idle = withTurnClock({ ...typed, status: 'idle' }, 12000)
    expect([typed.turn?.isAgentReply, typed.unseenAt, idle.finishedAt]).toEqual([
      false,
      null,
      12000
    ])
  })

  it('should keep a report that arrives after Claude replied inside the turn', () => {
    const working = withTurnClock({ ...tab(), status: 'working' }, 9000)
    const replied = applyEvent(working, {
      type: 'message',
      tab: 't1',
      message: message('a1', 'assistant', 'Reading the header')
    })
    const next = arrived(replied, 'r1')
    expect([next.messages.at(-1)?.is_mid_turn, next.turn?.isAgentReply]).toEqual([true, undefined])
  })
})

describe('withHistory', () => {
  it('should put older messages in front without duplicates', () => {
    const current = { ...tab(), messages: [message('m2', 'user', 'zwei')] }
    const next = withHistory(
      current,
      [message('m1', 'user', 'eins'), message('m2', 'user', 'zwei')],
      true
    )
    expect([next.messages.map((m) => m.uuid), next.hasMore]).toEqual([['m1', 'm2'], true])
  })

  it('should keep the MCP servers Claude reports at start', () => {
    const next = applyEvent(tab(), {
      type: 'claude',
      tab: 't1',
      event: {
        type: 'system',
        subtype: 'init',
        mcp_servers: [
          { name: 'obsidian', status: 'connected' },
          { name: 'figma', status: 'needs-auth' }
        ]
      }
    })
    expect(next.connectors).toEqual([
      { name: 'obsidian', status: 'connected' },
      { name: 'figma', status: 'needs-auth' }
    ])
  })

  it('should take the context window from the result of a turn', () => {
    const next = applyEvent(tab(), {
      type: 'claude',
      tab: 't1',
      event: {
        type: 'result',
        result: 'ok',
        modelUsage: { 'claude-opus-5-5': { inputTokens: 3, contextWindow: 1_000_000 } }
      }
    })
    expect(next.contextWindow).toBe(1_000_000)
  })

  it('should keep only the newest agent notices', () => {
    const notices = Array.from({ length: 60 }, (_, i) => ({
      id: `a${i}`,
      status: 'done' as const,
      at: i
    }))
    const next = withAgentNotices(tab(), notices)
    expect([
      next.agentNotices.length,
      next.agentNotices[0]?.id,
      next.agentNotices.at(-1)?.id
    ]).toEqual([50, 'a10', 'a59'])
  })
})

describe('pending prompts', () => {
  const NOW = Date.parse('2026-11-15T20:00:00Z')
  const pending = (id: string, text: string, isMidTurn = false) =>
    pendingMessageOf([{ type: 'text', text }], id, NOW, isMidTurn)
  const userEcho = (uuid: string, text: string) => ({
    type: 'message' as const,
    tab: 't1',
    message: message(uuid, 'user', text)
  })

  it('should replace the pending prompt with its echo without showing it twice', () => {
    const sent = withPendingPrompt({ ...tab(), isFresh: true }, pending('x1', 'Fix the header'))
    const next = applyEvent(sent, userEcho('u1', 'Fix the header'))
    expect([next.messages.map((m) => m.uuid), next.pending, next.isFresh]).toEqual([
      ['u1'],
      [],
      false
    ])
  })

  it('should title the tab only from a prompt that came back', () => {
    const sent = withPendingPrompt(tab(), pending('x1', 'Fix the header'))
    expect(sent.title).toBe('')
    expect(applyEvent(sent, userEcho('u1', 'Fix the header')).title).toBe('Fix the header')
  })

  it('should keep a second prompt pending until its own echo arrives', () => {
    const sent = withPendingPrompt(
      withPendingPrompt(tab(), pending('x1', 'Fix the header')),
      pending('x2', 'And the footer')
    )
    const next = applyEvent(sent, userEcho('u1', 'Fix the header'))
    expect(next.pending.map((m) => m.uuid)).toEqual(['pending:x2'])
  })

  it('should mark the live echo of a prompt sent after Claude replied as mid-turn', () => {
    const working = withTurnClock({ ...tab(), status: 'working' }, NOW)
    const replied = applyEvent(working, {
      type: 'message',
      tab: 't1',
      message: message('a1', 'assistant', 'Reading the header')
    })
    const next = applyEvent(replied, userEcho('u2', 'Also the footer'))
    expect(next.messages.at(-1)).toMatchObject({ uuid: 'u2', is_mid_turn: true })
  })

  it('should take back the given prompts, or all of them', () => {
    const sent = withPendingPrompt(
      withPendingPrompt(tab(), pending('x1', 'one')),
      pending('x2', 'two')
    )
    expect(withoutPending(sent, new Set(['pending:x1'])).pending.map((m) => m.uuid)).toEqual([
      'pending:x2'
    ])
    expect(withoutPending(sent).pending).toEqual([])
  })
})

describe('clearing a chat', () => {
  const talked = (): ChatTabState => ({
    ...tab(),
    title: 'Export bauen',
    sessionId: 'old',
    messages: [message('u1', 'user', 'Bau den Export'), message('a1', 'assistant', 'Fertig')],
    finishedAt: 1_000,
    contextWindow: 200_000,
    hasMore: true
  })

  it('should empty the chat when Claude resets the conversation', () => {
    const next = applyEvent(talked(), {
      type: 'claude',
      tab: 't1',
      event: { type: 'conversation_reset', trigger: 'clear' }
    })
    expect([next.messages, next.title, next.hasMore, next.history, next.isFresh]).toEqual([
      [],
      '',
      false,
      'loaded',
      false
    ])
  })

  it('should follow the new session Claude starts after /clear', () => {
    const next = applyEvent(talked(), {
      type: 'claude',
      tab: 't1',
      event: { type: 'system', subtype: 'init', session_id: 'new' }
    })
    expect(next.sessionId).toBe('new')
  })

  it('should leave the session id alone for other system events', () => {
    const next = applyEvent(talked(), {
      type: 'claude',
      tab: 't1',
      event: { type: 'system', subtype: 'hook_started', session_id: 'new' }
    })
    expect(next.sessionId).toBe('old')
  })

  it('should start a stopped tab over under a new fresh session', () => {
    const next = withNewSession(talked(), 'new')
    expect([next.sessionId, next.isFresh, next.messages, next.title, next.finishedAt]).toEqual([
      'new',
      true,
      [],
      '',
      null
    ])
  })
})

describe('streamed usage and retries', () => {
  const stream = (event: Record<string, unknown>) => ({
    type: 'claude' as const,
    tab: 't1',
    event: { type: 'stream_event', event }
  })
  const retry = {
    attempt: 1,
    maxRetries: 10,
    status: 529,
    reason: 'overloaded' as const,
    retriesAt: 5
  }

  it('should count streamed characters of the call and keep its final output count', () => {
    let next = applyEvent(tab(), stream({ type: 'message_start', message: { id: 'msg_1' } }))
    next = applyEvent(next, delta('Hello there'))
    next = applyEvent(
      next,
      stream({
        type: 'content_block_delta',
        delta: { type: 'input_json_delta', partial_json: '{"a":1}' }
      })
    )
    expect(next.streamUsage).toEqual({ messageId: 'msg_1', chars: 18 })
    next = applyEvent(next, stream({ type: 'message_delta', usage: { output_tokens: 97 } }))
    expect(next.outputs).toEqual({ msg_1: 97 })
    expect(next.streamUsage.chars).toBe(0)
  })

  it('should end a retry once Claude answers again, finishes or exits', () => {
    const waiting = { ...tab(), retry }
    expect(
      applyEvent(waiting, stream({ type: 'message_start', message: { id: 'm' } })).retry
    ).toBeNull()
    expect(
      applyEvent(waiting, { type: 'claude', tab: 't1', event: { type: 'result' } }).retry
    ).toBeNull()
    expect(applyEvent(waiting, { type: 'exited', tab: 't1', code: 0 }).retry).toBeNull()
  })
})
