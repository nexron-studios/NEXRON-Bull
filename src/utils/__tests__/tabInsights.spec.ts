import { describe, expect, it } from 'vitest'
import {
  agentNoticesOf,
  backgroundTasksOf,
  connectorsOf,
  connectorsOfStatus,
  contextOf,
  contextPercentOf,
  contextWindowOf,
  modelFamilyOf,
  subagentDurationOf,
  subagentsOf,
  turnSubagentsOf,
  withKnownConnectors,
  type Subagent
} from '../tabInsights'
import type { Block, ChatMessage } from '@/types/agentd.type'

const message = (
  uuid: string,
  at: string,
  blocks: Block[],
  usage?: ChatMessage['usage']
): ChatMessage => ({ uuid, role: 'assistant', at, blocks, usage })

const usage = (model: string, cacheRead: number) => ({
  model,
  input: 12,
  output: 300,
  cache_read: cacheRead,
  cache_write: 2_000
})

const agentCall = (id: string, input: Record<string, unknown>): Block => ({
  type: 'tool_use',
  id,
  name: 'Agent',
  input: { description: 'Check the tests', subagent_type: 'Explore', ...input }
})

const result = (id: string, text: string, isError = false): Block => ({
  type: 'tool_result',
  tool_use_id: id,
  is_error: isError,
  content: [{ type: 'text', text }]
})

describe('contextOf', () => {
  it('should read the newest reply with usage against the default window', () => {
    const messages = [
      message('a1', '2026-11-15T10:00:00Z', [], usage('claude-opus-5-5', 1_000)),
      message('a2', '2026-11-15T10:01:00Z', [], usage('claude-opus-5-5', 20_000)),
      message('u1', '2026-11-15T10:02:00Z', [])
    ]
    expect(contextOf(messages, null)).toEqual({
      tokens: 22_012,
      window: 200_000,
      model: 'claude-opus-5-5',
      split: { cached: 20_000, written: 2_000, fresh: 12 }
    })
  })

  it('should assume the 1M window for a [1m] model or a context past 200k', () => {
    const large = [message('a1', '', [], usage('claude-opus-5-5[1m]', 1_000))]
    const full = [message('a1', '', [], usage('claude-opus-5-5', 250_000))]
    expect([contextOf(large, null)?.window, contextOf(full, null)?.window]).toEqual([
      1_000_000, 1_000_000
    ])
  })

  it('should prefer the window Claude reported', () => {
    const messages = [message('a1', '', [], usage('claude-opus-5-5', 1_000))]
    expect(contextOf(messages, 500_000)?.window).toBe(500_000)
  })

  it('should give nothing before the first reply', () => {
    expect(contextOf([], null)).toBe(null)
  })
})

describe('contextWindowOf', () => {
  it('should take the largest window of the models in a result', () => {
    const event = {
      type: 'result',
      modelUsage: { a: { contextWindow: 200_000 }, b: { contextWindow: 1_000_000 } }
    }
    expect(contextWindowOf(event)).toBe(1_000_000)
  })

  it('should give nothing without model usage', () => {
    expect(contextWindowOf({ type: 'result' })).toBe(null)
  })
})

describe('connectorsOf', () => {
  it('should list the MCP servers of system/init and mark unknown states', () => {
    const event = {
      type: 'system',
      subtype: 'init',
      mcp_servers: [
        { name: 'obsidian', status: 'connected' },
        { name: 'linear', status: 'sleeping' }
      ]
    }
    expect(connectorsOf(event)).toEqual([
      { name: 'obsidian', status: 'connected' },
      { name: 'linear', status: 'unknown' }
    ])
  })

  it('should ignore other events', () => {
    expect(connectorsOf({ type: 'system', subtype: 'compact_boundary' })).toBe(null)
  })

  it("should ignore a subagent's init: it lists the subagent's servers, not the session's", () => {
    const event = {
      type: 'system',
      subtype: 'init',
      parent_tool_use_id: 'toolu_1',
      mcp_servers: []
    }
    expect(connectorsOf(event)).toBe(null)
  })
})

describe('withKnownConnectors', () => {
  it('should keep the known state of a server Claude reports pending again', () => {
    const known = [
      { name: 'figma', status: 'connected' as const },
      { name: 'zotero', status: 'needs-auth' as const }
    ]
    const reported = [
      { name: 'figma', status: 'pending' as const },
      { name: 'zotero', status: 'pending' as const },
      { name: 'miro', status: 'pending' as const }
    ]
    expect(withKnownConnectors(known, reported)).toEqual([
      { name: 'figma', status: 'connected' },
      { name: 'zotero', status: 'needs-auth' },
      { name: 'miro', status: 'pending' }
    ])
  })

  it('should take a settled report as it is', () => {
    const known = [{ name: 'figma', status: 'connected' as const }]
    const reported = [{ name: 'figma', status: 'failed' as const }]
    expect(withKnownConnectors(known, reported)).toEqual([{ name: 'figma', status: 'failed' }])
  })
})

describe('connectorsOfStatus', () => {
  it('should list the servers of an mcp_status answer, as Claude Code 2.1.329 sends it', () => {
    const response = {
      mcpServers: [
        {
          name: 'probe',
          status: 'pending',
          config: { type: 'stdio', command: 'node', args: ['server.mjs'] },
          transport: 'stdio',
          scope: 'user',
          source: 'user'
        },
        { name: 'figma', status: 'needs-auth' }
      ]
    }
    expect(connectorsOfStatus(response)).toEqual([
      { name: 'probe', status: 'pending' },
      { name: 'figma', status: 'needs-auth' }
    ])
  })

  it('should read an answer without servers as an empty list', () => {
    expect(connectorsOfStatus({ mcpServers: [] })).toEqual([])
    expect(connectorsOfStatus(null)).toEqual([])
  })

  it('should skip entries that are no named server', () => {
    expect(connectorsOfStatus({ mcpServers: [null, 'probe', { status: 'connected' }] })).toEqual([])
  })
})

describe('agentNoticesOf', () => {
  it('should read a finished background agent from its task notification', () => {
    const event = {
      type: 'user',
      message: {
        content:
          '<task-notification><task-id>a7f</task-id><status>completed</status></task-notification>'
      }
    }
    expect(agentNoticesOf(event, 5)).toEqual([{ id: 'a7f', status: 'done', at: 5 }])
  })

  it('should prefer the tool use id and count other states as failed', () => {
    const event = {
      type: 'user',
      message: {
        content: [
          {
            type: 'text',
            text: '<task-notification><tool-use-id>toolu_1</tool-use-id><task-id>a7f</task-id><status>killed</status></task-notification>'
          }
        ]
      }
    }
    expect(agentNoticesOf(event, 5)).toEqual([{ id: 'toolu_1', status: 'failed', at: 5 }])
  })

  it('should read the end of a background task from the live system event', () => {
    const event = {
      type: 'system',
      subtype: 'task_notification',
      task_id: 'blj8exi1k',
      tool_use_id: 'toolu_9',
      status: 'completed',
      summary: 'Background command "Ping" completed (exit code 0)'
    }
    expect(agentNoticesOf(event, 7)).toEqual([{ id: 'toolu_9', status: 'done', at: 7 }])
  })

  it('should ignore ordinary user turns', () => {
    expect(agentNoticesOf({ type: 'user', message: { content: 'hallo' } }, 5)).toEqual([])
  })
})

describe('backgroundTasksOf', () => {
  // As Claude Code 2.1.332 sends it: every live task with its description.
  const event = {
    type: 'system',
    subtype: 'background_tasks_changed',
    tasks: [
      {
        task_id: 'blj8exi1k',
        task_type: 'local_bash',
        description: 'Follow act video generation until done'
      },
      {
        task_id: 'a3cb1f0c2392d1046',
        task_type: 'local_agent',
        subagent_type: 'general-purpose',
        description: 'Check the release'
      },
      { task_id: 'w1', task_type: 'local_bash', description: 'Live updates', ambient: true }
    ]
  }

  it('should name the tasks that count as activity and leave out ambient ones', () => {
    expect(backgroundTasksOf(event)).toEqual({
      active: [
        { id: 'blj8exi1k', description: 'Follow act video generation until done' },
        { id: 'a3cb1f0c2392d1046', description: 'Check the release' }
      ]
    })
  })

  it('should keep a task without a description with an empty name', () => {
    const bare = { ...event, tasks: [{ task_id: 'b1', task_type: 'local_bash' }] }
    expect(backgroundTasksOf(bare)?.active).toEqual([{ id: 'b1', description: '' }])
  })

  it('should ignore other system events', () => {
    expect(backgroundTasksOf({ type: 'system', subtype: 'init' })).toBeNull()
  })
})

describe('subagentsOf', () => {
  const started = '2026-11-15T10:00:00Z'
  const ended = '2026-11-15T10:02:00Z'

  it('should finish a foreground agent with its result', () => {
    const messages = [
      message('a1', started, [agentCall('toolu_1', {})]),
      message('u1', ended, [result('toolu_1', 'All green')])
    ]
    expect(subagentsOf(messages, [], true)).toEqual([
      {
        id: 'toolu_1',
        title: 'Check the tests',
        agentType: 'Explore',
        isBackground: false,
        agentId: null,
        runId: 'toolu_1',
        status: 'done',
        startedAt: Date.parse(started),
        finishedAt: Date.parse(ended)
      }
    ])
  })

  it('should keep a foreground agent running until its result and mark errors failed', () => {
    const running = subagentsOf([message('a1', started, [agentCall('toolu_1', {})])], [], true)
    const failed = subagentsOf(
      [
        message('a1', started, [agentCall('toolu_1', {})]),
        message('u1', ended, [result('toolu_1', 'boom', true)])
      ],
      [],
      true
    )
    expect([running[0]?.status, failed[0]?.status]).toEqual(['running', 'failed'])
  })

  it('should run a background agent until its notice names the agent id', () => {
    const messages = [
      message('a1', started, [agentCall('toolu_2', { run_in_background: true })]),
      message('u1', started, [result('toolu_2', 'Async agent launched. agentId: a7f')])
    ]
    const before = subagentsOf(messages, [], true)
    const after = subagentsOf(messages, [{ id: 'a7f', status: 'done', at: 99 }], true)
    expect([before[0]?.status, after[0]?.status, after[0]?.finishedAt, after[0]?.agentId]).toEqual([
      'running',
      'done',
      99,
      'a7f'
    ])
  })

  it('should treat an agent Claude Code launched async on its own as a background agent', () => {
    const messages = [
      message('a1', started, [agentCall('toolu_3', {})]),
      message('u1', started, [
        result('toolu_3', 'Async agent launched successfully.\nagentId: a9c (internal ID)')
      ])
    ]
    const before = subagentsOf(messages, [], true)
    const after = subagentsOf(messages, [{ id: 'toolu_3', status: 'done', at: 120 }], true)
    expect([before[0]?.status, before[0]?.isBackground, after[0]?.status]).toEqual([
      'running',
      true,
      'done'
    ])
  })

  it('should end a background agent the stream no longer lists as a running task', () => {
    const messages = [
      message('a1', started, [agentCall('toolu_4', { run_in_background: true })]),
      message('u1', started, [result('toolu_4', 'Async agent launched. agentId: a7f')])
    ]
    const listed = subagentsOf(messages, [], true, {
      active: [{ id: 'a7f', description: 'Explore' }],
      at: 50
    })
    const gone = subagentsOf(messages, [], true, {
      active: [{ id: 'b1', description: 'npm run dev' }],
      at: 60
    })
    expect([listed[0]?.status, gone[0]?.status, gone[0]?.finishedAt]).toEqual([
      'running',
      'done',
      60
    ])
  })

  describe('a subagent woken again with SendMessage', () => {
    const resumed = '2026-11-15T11:00:00Z'
    const sendMessage = (id: string): Block => ({
      type: 'tool_use',
      id,
      name: 'SendMessage',
      input: { to: 'a7f', message: 'Go on' }
    })
    // A limit cut the agent off; the next turn resumes it (Claude Code 2.1.3xx answers in JSON).
    const messages = [
      message('a1', started, [agentCall('toolu_5', { run_in_background: true })]),
      message('u1', started, [result('toolu_5', 'Async agent launched. agentId: a7f')]),
      message('a2', resumed, [sendMessage('toolu_send')]),
      message('u2', resumed, [
        result(
          'toolu_send',
          '{"success":true,"message":"Resuming agent a7f","resumedAgentId":"a7f"}'
        )
      ])
    ]
    const firstEnd = { id: 'toolu_5', status: 'failed' as const, at: 10 }

    it('should run again under the SendMessage call though its first run failed', () => {
      const [agent] = subagentsOf(messages, [firstEnd], true, { active: [], at: 10 })
      expect([agent?.status, agent?.runId, agent?.startedAt]).toEqual([
        'running',
        'toolu_send',
        Date.parse(resumed)
      ])
    })

    it('should end with the notice of the resumed run', () => {
      const secondEnd = { id: 'toolu_send', status: 'done' as const, at: Date.parse(resumed) + 5 }
      const [agent] = subagentsOf(messages, [firstEnd, secondEnd], true)
      expect([agent?.status, agent?.finishedAt]).toEqual(['done', Date.parse(resumed) + 5])
    })

    it('should list it under the turn that resumed it', () => {
      const agents = subagentsOf(messages, [firstEnd], true)
      const turn = { messages: messages.slice(2), startedAt: Date.parse(resumed) }
      expect(turnSubagentsOf(agents, turn).map((agent) => agent.id)).toEqual(['toolu_5'])
    })

    it('should not take a message to a running agent for a resume', () => {
      const queued = [
        ...messages.slice(0, 3),
        message('u2', resumed, [result('toolu_send', '{"success":true,"message":"Queued"}')])
      ]
      const [agent] = subagentsOf(queued, [firstEnd], true)
      expect([agent?.status, agent?.runId]).toEqual(['failed', 'toolu_5'])
    })
  })

  it('should not show an agent as running once Claude has exited', () => {
    const messages = [message('a1', started, [agentCall('toolu_1', {})])]
    expect(subagentsOf(messages, [], false)[0]?.status).toBe('done')
  })
})

describe('contextPercentOf', () => {
  it('should round the share of the window and stop at 100', () => {
    const split = { cached: 0, written: 0, fresh: 0 }
    expect(contextPercentOf({ tokens: 22_400, window: 200_000, model: 'm', split })).toBe(11)
    expect(contextPercentOf({ tokens: 250_000, window: 200_000, model: 'm', split })).toBe(100)
  })
})

describe('modelFamilyOf', () => {
  it('should find the family in a full model id', () => {
    expect(modelFamilyOf('claude-haiku-4-5-20251001')).toBe('haiku')
    expect(modelFamilyOf('claude-opus-5-5[1m]')).toBe('opus')
    expect(modelFamilyOf('gpt-5')).toBeNull()
  })
})

describe('subagentDurationOf', () => {
  const agent = (startedAt: number | null, finishedAt: number | null): Subagent => ({
    id: 'a',
    title: 'Check the tests',
    agentType: 'Explore',
    isBackground: false,
    agentId: null,
    runId: 'a',
    status: finishedAt === null ? 'running' : 'done',
    startedAt,
    finishedAt
  })

  it('should measure a finished agent to its end and a running one to now', () => {
    expect(subagentDurationOf(agent(1_000, 39_000), 99_000)).toBe(38_000)
    expect(subagentDurationOf(agent(1_000, null), 131_000)).toBe(130_000)
  })

  it('should have no duration without a start time', () => {
    expect(subagentDurationOf(agent(null, null), 5_000)).toBeNull()
  })
})

describe('turnSubagentsOf', () => {
  const TURN_START = Date.parse('2026-11-15T10:05:00Z')
  const agent = (
    id: string,
    status: Subagent['status'],
    finishedAt: number | null = null,
    isBackground = true
  ): Subagent => ({
    id,
    title: id,
    agentType: 'Explore',
    isBackground,
    agentId: null,
    runId: id,
    status,
    startedAt: null,
    finishedAt
  })

  it('should keep the agents of the turn and older background ones running or ending in it', () => {
    const agents = [
      agent('old_done', 'done', TURN_START - 1),
      agent('old_running', 'running'),
      agent('old_ended_now', 'done', TURN_START + 1),
      agent('old_cut_off', 'running', null, false),
      agent('new', 'done', TURN_START + 2, false)
    ]
    const turn = {
      messages: [message('a2', '2026-11-15T10:05:00Z', [agentCall('new', {})])],
      startedAt: TURN_START
    }
    expect(turnSubagentsOf(agents, turn).map((a) => a.id)).toEqual([
      'old_running',
      'old_ended_now',
      'new'
    ])
  })
})
