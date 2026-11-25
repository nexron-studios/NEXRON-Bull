import { describe, expect, it } from 'vitest'
import { activityOfTab, foregroundShellOf, isAwaitingReply } from '../activity'
import { newTab, type ChatTabState } from '../chatTab'
import type { ChatMessage } from '@/types/agentd.type'

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
  status: 'working',
  ...fields
})

const prompt: ChatMessage = {
  uuid: 'p1',
  role: 'user',
  at: null,
  blocks: [{ type: 'text', text: 'Check the week view' }]
}
const read: ChatMessage = {
  uuid: 'a1',
  role: 'assistant',
  at: null,
  blocks: [
    { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'C:\\src\\CalendarWeek.vue' } }
  ]
}

const noResults = new Map()

describe('activityOfTab', () => {
  it('should name the tool call that waits for its result', () => {
    const turn = { startedAt: 0, afterUuid: null }
    expect(activityOfTab(tab({ messages: [prompt, read], turn }), noResults)).toEqual({
      kind: 'tool',
      activity: 'reads',
      tool: 'Read',
      target: 'CalendarWeek.vue'
    })
  })

  it('should ignore a call an earlier turn left without result', () => {
    const next = { ...prompt, uuid: 'p2' }
    const turn = { startedAt: 0, afterUuid: 'a1' }
    expect(activityOfTab(tab({ messages: [prompt, read, next], turn }), noResults)).toEqual({
      kind: 'working'
    })
  })

  it('should keep the running call when a prompt arrives mid-turn', () => {
    const steer = { ...prompt, uuid: 'p2' }
    const turn = { startedAt: 0, afterUuid: 'p1' }
    expect(activityOfTab(tab({ messages: [prompt, read, steer], turn }), noResults)).toMatchObject({
      kind: 'tool',
      tool: 'Read'
    })
  })

  it('should name the block Claude streams, also one too long to replay', () => {
    expect([
      activityOfTab(tab({ live: { kind: 'thinking', text: '' } }), noResults),
      activityOfTab(tab({ live: { kind: 'writing', text: 'Hal' } }), noResults),
      activityOfTab(tab({ live: { kind: 'cut', of: 'writing' } }), noResults)
    ]).toEqual([{ kind: 'thinking' }, { kind: 'writing' }, { kind: 'writing' }])
  })

  it('should report a pending approval first', () => {
    const permission = { requestId: 'r1', toolName: 'Bash', input: {}, suggestions: [] }
    expect(
      activityOfTab(tab({ permission, live: { kind: 'thinking', text: '' } }), noResults)
    ).toEqual({ kind: 'asking' })
  })
})

describe('isAwaitingReply', () => {
  const turn = { startedAt: 0, afterUuid: 'a1' }

  it('should wait while nothing from Claude came after the turn started', () => {
    expect(
      isAwaitingReply(tab({ messages: [prompt, read, { ...prompt, uuid: 'p2' }], turn }))
    ).toBe(true)
  })

  it('should stop waiting once Claude answered in this turn', () => {
    const reply = { ...read, uuid: 'a2' }
    expect(isAwaitingReply(tab({ messages: [prompt, read, reply], turn }))).toBe(false)
  })
})

describe('foregroundShellOf', () => {
  const shell = (id: string, input: Record<string, unknown>): ChatMessage => ({
    uuid: `a-${id}`,
    role: 'assistant',
    at: null,
    blocks: [{ type: 'tool_use', id, name: 'Bash', input }]
  })
  const turn = { startedAt: 0, afterUuid: null }

  it('should find the shell Claude waits on', () => {
    const running = tab({ turn, messages: [shell('b1', { command: 'npm test' })] })
    expect(foregroundShellOf(running)?.id).toBe('b1')
  })

  it('should skip a shell started in the background and an idle tab', () => {
    const background = shell('b2', { command: 'npm run dev', run_in_background: true })
    expect(foregroundShellOf(tab({ turn, messages: [background] }))).toBeNull()
    const idle = tab({ status: 'idle', turn, messages: [shell('b1', { command: 'ls' })] })
    expect(foregroundShellOf(idle)).toBeNull()
  })
})
