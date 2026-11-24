import { describe, expect, it } from 'vitest'
import {
  actionSummaryOf,
  historyRunsOf,
  MAX_LIVE_ACTIONS,
  subagentActionsOf,
  withSubagentEvent,
  type LiveSubagent
} from '../subagentActions'
import type { ChatMessage, SubagentTranscript } from '@/types/agentd.type'
import type { ToolRun } from '../tabActivity'
import type { Subagent } from '../tabInsights'

const agent = (fields: Partial<Subagent> = {}): Subagent => ({
  id: 'toolu_a',
  title: 'Find the header',
  agentType: 'Explore',
  isBackground: false,
  agentId: 'a1',
  runId: 'toolu_a',
  status: 'running',
  startedAt: 1_000,
  finishedAt: null,
  ...fields
})

const run = (id: string, fields: Partial<ToolRun> = {}): ToolRun => ({
  id,
  name: 'Read',
  target: `${id}.ts`,
  status: 'done',
  startedAt: 1_000,
  finishedAt: 2_000,
  ...fields
})

const callEvent = (parent: string | null, blocks: unknown[]) => ({
  type: 'assistant',
  ...(parent ? { parent_tool_use_id: parent } : {}),
  message: { content: blocks }
})
const resultEvent = (parent: string, toolId: string, isError = false) => ({
  type: 'user',
  parent_tool_use_id: parent,
  message: { content: [{ type: 'tool_result', tool_use_id: toolId, is_error: isError }] }
})
const grep = { type: 'tool_use', id: 'x1', name: 'Grep', input: { pattern: 'SiteHeader' } }

describe('withSubagentEvent', () => {
  it('should add a subagent call as running from when it arrived', () => {
    const next = withSubagentEvent({}, callEvent('toolu_a', [grep]), 5_000)
    expect(next).toEqual({
      toolu_a: {
        calls: [
          {
            id: 'x1',
            name: 'Grep',
            target: 'SiteHeader',
            status: 'running',
            startedAt: 5_000,
            finishedAt: null
          }
        ],
        lateResults: {}
      }
    })
  })

  it('should finish the call with its result and mark errors failed', () => {
    const runs = withSubagentEvent({}, callEvent('toolu_a', [grep]), 5_000) ?? {}
    const done = withSubagentEvent(runs, resultEvent('toolu_a', 'x1'), 7_000)
    const failed = withSubagentEvent(runs, resultEvent('toolu_a', 'x1', true), 7_000)
    const call = done?.toolu_a?.calls[0]
    expect([call?.status, call?.finishedAt]).toEqual(['done', 7_000])
    expect(failed?.toolu_a?.calls[0]?.status).toBe('failed')
  })

  it('should keep a result whose call came before the app listened', () => {
    const next = withSubagentEvent({}, resultEvent('toolu_a', 'old', true), 7_000)
    expect(next).toEqual({
      toolu_a: { calls: [], lateResults: { old: { status: 'failed', finishedAt: 7_000 } } }
    })
  })

  it('should ignore the main chat, text-only turns, repeats and task tools', () => {
    const runs = withSubagentEvent({}, callEvent('toolu_a', [grep]), 5_000) ?? {}
    const todo = { type: 'tool_use', id: 'x2', name: 'TodoWrite', input: {} }
    expect([
      withSubagentEvent({}, callEvent(null, [grep]), 5_000),
      withSubagentEvent({}, callEvent('toolu_a', [{ type: 'text', text: 'Hi' }]), 5_000),
      withSubagentEvent(runs, callEvent('toolu_a', [grep]), 6_000),
      withSubagentEvent({}, callEvent('toolu_a', [todo]), 5_000)
    ]).toEqual([null, null, null, null])
  })

  it('should keep only the newest calls of a long run', () => {
    const many = Array.from({ length: MAX_LIVE_ACTIONS }, (_, i) => run(`r${i}`))
    const live = { toolu_a: { calls: many, lateResults: {} } }
    const calls = withSubagentEvent(live, callEvent('toolu_a', [grep]), 5_000)?.toolu_a?.calls
    expect([calls?.length, calls?.[0]?.id, calls?.at(-1)?.id]).toEqual([
      MAX_LIVE_ACTIONS,
      'r1',
      'x1'
    ])
  })
})

describe('historyRunsOf', () => {
  const messages: ChatMessage[] = [
    {
      uuid: 'c1',
      role: 'assistant',
      at: '2026-11-16T10:00:01Z',
      blocks: [{ type: 'tool_use', id: 'g1', name: 'Glob', input: { pattern: '**/*.vue' } }]
    },
    {
      uuid: 'r1',
      role: 'user',
      at: '2026-11-16T10:00:03Z',
      blocks: [{ type: 'tool_result', tool_use_id: 'g1', is_error: false, content: [] }]
    }
  ]
  const glob: ToolRun = {
    id: 'g1',
    name: 'Glob',
    target: '**/*.vue',
    status: 'done',
    startedAt: Date.parse('2026-11-16T10:00:01Z'),
    finishedAt: Date.parse('2026-11-16T10:00:03Z')
  }

  it('should file a transcript under the call its meta file names', () => {
    const transcripts: SubagentTranscript[] = [{ agent_id: 'zz', tool_use_id: 'toolu_a', messages }]
    expect(historyRunsOf(transcripts, [agent()])).toEqual({ toolu_a: [glob] })
  })

  it('should match a transcript without meta by the agent id of the call', () => {
    const transcripts: SubagentTranscript[] = [
      { agent_id: 'a1', tool_use_id: null, messages },
      { agent_id: 'unknown', tool_use_id: null, messages }
    ]
    expect(historyRunsOf(transcripts, [agent()])).toEqual({ toolu_a: [glob] })
  })
})

describe('subagentActionsOf', () => {
  const live = (calls: ToolRun[], lateResults: LiveSubagent['lateResults'] = {}) => ({
    calls,
    lateResults
  })
  const pending = { status: 'running', finishedAt: null } as const

  it('should merge transcript and live calls in the order they started', () => {
    const actions = subagentActionsOf(
      agent(),
      live([run('b', { startedAt: 2_000 }), run('c', { startedAt: 3_000 })]),
      [run('d', { startedAt: 4_000 }), run('a', { startedAt: 1_000 })]
    )
    expect(actions.map((action) => action.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('should prefer a finished call over the same one still running', () => {
    const liveRunning = subagentActionsOf(agent(), live([run('a', pending)]), [run('a')])
    const historyRunning = subagentActionsOf(agent(), live([run('b')]), [run('b', pending)])
    expect([liveRunning[0]?.status, historyRunning[0]?.status]).toEqual(['done', 'done'])
  })

  it('should finish a transcript call with a result that came live', () => {
    const late = { x: { status: 'done', finishedAt: 8_000 } } as const
    const [action] = subagentActionsOf(agent(), live([], late), [run('x', pending)])
    expect([action?.status, action?.finishedAt]).toEqual(['done', 8_000])
  })

  it('should show a call cut off by the end of its subagent as stopped', () => {
    const calls = live([run('a', pending)])
    const ended = subagentActionsOf(agent({ status: 'done', finishedAt: 9_000 }), calls)
    const going = subagentActionsOf(agent(), calls)
    expect([ended[0]?.status, going[0]?.status]).toEqual(['stopped', 'running'])
  })
})

describe('actionSummaryOf', () => {
  it('should name the first two actions with their targets', () => {
    const actions = [
      run('a', { target: 'tokens.css' }),
      run('b', { name: 'Grep', target: '--brand' }),
      run('c')
    ]
    expect(actionSummaryOf(actions)).toBe('Read tokens.css, Grep --brand')
  })

  it('should name a tool without target alone', () => {
    expect(actionSummaryOf([run('a', { name: 'WebSearch', target: '' })])).toBe('WebSearch')
  })
})
