import { describe, expect, it } from 'vitest'
import { buildStream, thinkingSeconds } from '../chatStream'
import { resultsByToolId } from '../toolPairs'
import type { Block, ChatMessage } from '@/types/agentd.type'

const stream = (messages: ChatMessage[]) => buildStream(messages, resultsByToolId(messages))

const message = (
  uuid: string,
  role: ChatMessage['role'],
  blocks: Block[],
  at: string | null = null
): ChatMessage => ({ uuid, role, at, blocks })

const prompt = message(
  'p1',
  'user',
  [{ type: 'text', text: 'Fix the header' }],
  '2026-11-15T10:00:00Z'
)
const thinking = message(
  'a1',
  'assistant',
  [{ type: 'thinking', text: 'Look first.' }],
  '2026-11-15T10:00:12Z'
)
const intro = message('a2', 'assistant', [{ type: 'text', text: 'I read the header.' }])
const read = message('a3', 'assistant', [
  { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'src/Header.vue' } }
])
const readResult = message('u1', 'user', [
  { type: 'tool_result', tool_use_id: 't1', is_error: false, content: [] }
])
const todo = message('a4', 'assistant', [
  {
    type: 'tool_use',
    id: 't2',
    name: 'TodoWrite',
    input: { todos: [{ content: 'Read header', status: 'completed', activeForm: 'Reading' }] }
  }
])
const answer = message('a5', 'assistant', [{ type: 'text', text: 'Done.' }])

describe('thinkingSeconds', () => {
  it('should measure from the line before the thinking block', () => {
    expect(thinkingSeconds([prompt, thinking])).toEqual(new Map([['a1', 12]]))
  })

  it('should give null when a timestamp is missing', () => {
    expect(thinkingSeconds([intro, thinking])).toEqual(new Map([['a1', null]]))
  })
})

describe('buildStream', () => {
  it('should fold reads into one line and keep text, thinking and answer around it', () => {
    const items = stream([prompt, thinking, intro, read, readResult, answer])
    expect(items.map((item) => item.kind)).toEqual([
      'message',
      'reasoning',
      'message',
      'reads',
      'message'
    ])
    expect(items[3]).toMatchObject({
      kind: 'reads',
      isCurrent: true,
      steps: [{ kind: 'tool', block: { name: 'Read' } }]
    })
    expect(items[4]).toMatchObject({ message: { blocks: [{ type: 'text', text: 'Done.' }] } })
  })

  it('should fold thinking between reads into the line and leave thinking after them out', () => {
    const between = message('a20', 'assistant', [{ type: 'thinking', text: 'Now the footer.' }])
    const grep = message('a21', 'assistant', [
      { type: 'tool_use', id: 't21', name: 'Grep', input: { pattern: 'Footer' } }
    ])
    const after = message('a22', 'assistant', [{ type: 'thinking', text: 'Got it.' }])
    const items = stream([prompt, read, readResult, between, grep, after, answer])
    expect(items.map((item) => item.kind)).toEqual(['message', 'reads', 'reasoning', 'message'])
    expect(items[1]).toMatchObject({
      steps: [{ kind: 'tool' }, { kind: 'reasoning', key: 'a20:0' }, { kind: 'tool' }]
    })
    expect(items[2]).toMatchObject({ key: 'a22:0' })
  })

  it('should give a call that changes something its own card between two runs of reads', () => {
    const edit = message('a23', 'assistant', [
      { type: 'tool_use', id: 't23', name: 'Edit', input: { file_path: 'src/Header.vue' } }
    ])
    const glob = message('a24', 'assistant', [
      { type: 'tool_use', id: 't24', name: 'Glob', input: { pattern: '*.vue' } }
    ])
    const items = stream([prompt, read, readResult, edit, glob])
    expect(items.map((item) => [item.kind, item.key])).toEqual([
      ['message', 'p1'],
      ['reads', 'reads:a3:0'],
      ['tool', 'a23:0'],
      ['reads', 'reads:a24:0']
    ])
  })

  it('should keep a read a hook blocked out of the fold', () => {
    const blocked = message('u30', 'user', [
      {
        type: 'tool_result',
        tool_use_id: 't1',
        is_error: true,
        content: [{ type: 'text', text: 'PreToolUse:Read hook error: [guard]: no .env' }]
      }
    ])
    const items = stream([prompt, read, blocked, answer])
    expect(items.map((item) => item.kind)).toEqual(['message', 'tool', 'message'])
  })

  it('should show thinking and answer alone when no tool ran', () => {
    const items = stream([prompt, thinking, answer])
    expect(items.map((item) => item.kind)).toEqual(['message', 'reasoning', 'message'])
  })

  it('should turn the latest TodoWrite into steps instead of a card', () => {
    const items = stream([prompt, read, readResult, todo, answer])
    expect(items.at(-1)).toEqual({
      kind: 'todos',
      key: 'todos:a3:0',
      todos: [{ id: '1', content: 'Read header', status: 'completed' }],
      isCurrent: true
    })
    expect(items.map((item) => item.kind)).toEqual(['message', 'reads', 'message', 'todos'])
  })

  it('should carry tasks created in an earlier turn into the next one', () => {
    const create = message('a7', 'assistant', [
      { type: 'tool_use', id: 't4', name: 'TaskCreate', input: { subject: 'Build' } }
    ])
    const created = message('u4', 'user', [
      {
        type: 'tool_result',
        tool_use_id: 't4',
        is_error: false,
        content: [{ type: 'text', text: 'Task #1 created successfully: Build' }]
      }
    ])
    const next = message('p2', 'user', [{ type: 'text', text: 'Go on' }])
    const done = message('a8', 'assistant', [
      {
        type: 'tool_use',
        id: 't5',
        name: 'TaskUpdate',
        input: { taskId: '1', status: 'completed' }
      }
    ])
    const items = stream([prompt, create, created, next, done])
    expect(items.filter((item) => item.kind === 'todos')).toEqual([
      {
        kind: 'todos',
        key: 'todos:a7:0',
        todos: [{ id: '1', content: 'Build', status: 'pending' }],
        isCurrent: false
      },
      {
        kind: 'todos',
        key: 'todos:a8:0',
        todos: [{ id: '1', content: 'Build', status: 'completed' }],
        isCurrent: true
      }
    ])
  })

  it('should keep a prompt sent mid-turn inside the running turn', () => {
    const steer = {
      ...message('p2', 'user', [{ type: 'text', text: 'Also check the footer' }]),
      is_mid_turn: true
    }
    const edit = message('a9', 'assistant', [
      { type: 'tool_use', id: 't9', name: 'Edit', input: { file_path: 'src/Footer.vue' } }
    ])
    const items = stream([prompt, read, readResult, steer, edit])
    expect(items.map((item) => [item.kind, item.key])).toEqual([
      ['message', 'p1'],
      ['reads', 'reads:a3:0'],
      ['message', 'p2'],
      ['tool', 'a9:0']
    ])
    expect(items[3]).toMatchObject({ isCurrent: true })
  })

  it('should keep a hook line inside the run it spoke up in', () => {
    const hook = message('h1', 'system', [
      { type: 'hook', event: 'PostToolUse', tool: 'Read', outcome: 'failed', text: 'boom' }
    ])
    const items = stream([prompt, read, readResult, hook, answer])
    expect(items.map((item) => [item.kind, item.key])).toEqual([
      ['message', 'p1'],
      ['reads', 'reads:a3:0'],
      ['message', 'h1'],
      ['message', 'answer:a5:0']
    ])
    expect(items[1]).toMatchObject({ isCurrent: true })
  })

  it('should mark the calls of an earlier turn as no longer current', () => {
    const next = message('p2', 'user', [{ type: 'text', text: 'Thanks' }])
    const items = stream([prompt, read, readResult, answer, next])
    expect(items[1]).toMatchObject({ kind: 'reads', isCurrent: false })
  })

  describe('turn stats', () => {
    const reply = (uuid: string, id: string, output: number, at: string): ChatMessage => ({
      ...message(uuid, 'assistant', [{ type: 'text', text: uuid }], at),
      usage: { model: 'claude-opus-5-5', id, input: 3, output, cache_read: 0, cache_write: 0 }
    })
    const first = reply('a30', 'msg_1', 120, '2026-11-15T10:01:00Z')
    const second = reply('a31', 'msg_2', 80, '2026-11-15T10:04:12Z')

    it('should put what a finished turn took under its last answer', () => {
      const items = stream([prompt, first, read, readResult, second])
      expect(items.at(-1)).toMatchObject({
        kind: 'message',
        stats: { durationMs: 252_000, outputTokens: 200, model: 'claude-opus-5-5' }
      })
      expect(items.filter((item) => item.kind === 'message' && item.stats)).toHaveLength(1)
    })

    it('should leave the running turn without stats', () => {
      const items = buildStream([prompt, first], new Map(), { isRunning: true })
      expect(items.at(-1)).not.toHaveProperty('stats')
    })

    it('should close an earlier turn once the next prompt comes, even while that one runs', () => {
      const next = message('p3', 'user', [{ type: 'text', text: 'More' }])
      const items = buildStream([prompt, first, next], new Map(), { isRunning: true })
      expect(items[1]).toMatchObject({ stats: { outputTokens: 120 } })
    })

    it('should count the final output a live stream reported for a call', () => {
      const items = buildStream([prompt, first], new Map(), { outputs: { msg_1: 410 } })
      expect(items.at(-1)).toMatchObject({ stats: { outputTokens: 410 } })
    })
  })

  it('should collect the pages a WebFetch read as sources', () => {
    const fetch = message('a6', 'assistant', [
      {
        type: 'tool_use',
        id: 't3',
        name: 'WebFetch',
        input: { url: 'https://www.prompt-kit.com/docs' }
      }
    ])
    const items = stream([prompt, fetch, answer])
    expect(items.find((item) => item.kind === 'sources')).toEqual({
      kind: 'sources',
      key: 'sources:a6:0',
      sources: [{ url: 'https://www.prompt-kit.com/docs', domain: 'prompt-kit.com' }]
    })
  })
})
