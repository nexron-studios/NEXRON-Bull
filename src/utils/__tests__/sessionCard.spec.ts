import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types/agentd.type'
import { newTab, type ChatTabState } from '../chatTab'
import { cardPromptsOf, cardStatusOf, cardStepOf, startPromptOf } from '../sessionCard'

const tab = (fields: Partial<ChatTabState> = {}): ChatTabState => ({
  ...newTab({
    id: 't',
    title: '',
    profile: null,
    account: 'default',
    cwd: 'C:\\work',
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  history: 'loaded',
  ...fields
})

const prompt = (uuid: string, text: string): ChatMessage => ({
  uuid,
  role: 'user',
  at: null,
  blocks: [{ type: 'text', text }]
})

const answer = (uuid: string, text: string): ChatMessage => ({
  uuid,
  role: 'assistant',
  at: null,
  blocks: [{ type: 'text', text }]
})

const toolCall = (uuid: string): ChatMessage => ({
  uuid,
  role: 'assistant',
  at: null,
  blocks: [{ type: 'tool_use', id: 'c1', name: 'Read', input: { file_path: 'C:\\src\\App.vue' } }]
})

describe('cardPromptsOf', () => {
  it('should name the first and last prompt and count every prompt, pending ones too', () => {
    const messages = [prompt('p1', 'fix\nthe login'), answer('a1', 'Done'), prompt('p2', 'thanks')]
    const result = cardPromptsOf(tab({ messages, pending: [prompt('q1', 'and the logout')] }))
    expect(result).toEqual({ first: 'fix the login', last: 'and the logout', count: 3 })
  })

  it('should leave first and count out while older messages are not loaded', () => {
    const messages = [prompt('p7', 'later prompt')]
    expect([
      cardPromptsOf(tab({ messages, hasMore: true })),
      cardPromptsOf(tab({ messages, history: 'none' }))
    ]).toEqual([
      { first: null, last: 'later prompt', count: null },
      { first: null, last: 'later prompt', count: null }
    ])
  })

  it('should not count tool results as prompts', () => {
    const result: ChatMessage = {
      uuid: 'r1',
      role: 'user',
      at: null,
      blocks: [{ type: 'tool_result', tool_use_id: 'c1', is_error: false, content: [] }]
    }
    expect(cardPromptsOf(tab({ messages: [prompt('p1', 'go'), result] })).count).toBe(1)
  })
})

describe('startPromptOf', () => {
  it('should show the first prompt under a title Claude gave the chat', () => {
    const prompts = { first: 'fix the login', last: 'thanks', count: 2 }
    expect(startPromptOf('Login bug', prompts)).toBe('fix the login')
  })

  it('should leave it out when the title was cut from it or it is also the last prompt', () => {
    expect([
      startPromptOf('fix the', { first: 'fix the login', last: 'thanks', count: 2 }),
      startPromptOf('Login bug', { first: 'go', last: 'go', count: 1 }),
      startPromptOf('Login bug', { first: null, last: 'go', count: null })
    ]).toEqual([null, null, null])
  })
})

describe('cardStepOf', () => {
  it('should show the tool Claude runs right now', () => {
    const running = tab({
      status: 'working',
      messages: [prompt('p1', 'go'), toolCall('a1')],
      turn: { startedAt: 0, afterUuid: 'p1' }
    })
    expect(cardStepOf(running)).toEqual({
      kind: 'activity',
      activity: { kind: 'tool', tool: 'Read', target: 'App.vue' },
      isApproval: false
    })
  })

  it('should mark a tool call that waits for approval', () => {
    const asking = tab({
      status: 'asking',
      messages: [prompt('p1', 'go')],
      turn: { startedAt: 0, afterUuid: 'p1' },
      permission: {
        requestId: 'r1',
        toolName: 'Bash',
        input: { command: 'git push' },
        suggestions: []
      }
    })
    expect(cardStepOf(asking)).toMatchObject({ kind: 'activity', isApproval: true })
  })

  it("should show this turn's answer while Claude works on, not an older one", () => {
    const older = [prompt('p1', 'go'), answer('a1', 'Old answer'), prompt('p2', 'more')]
    const working = tab({
      status: 'working',
      messages: older,
      turn: { startedAt: 0, afterUuid: 'p2' }
    })
    const replied = tab({
      status: 'working',
      messages: [...older, answer('a2', '**Found** it\nsecond line')],
      turn: { startedAt: 0, afterUuid: 'p2' }
    })
    expect([cardStepOf(working), cardStepOf(replied)]).toEqual([
      { kind: 'activity', activity: { kind: 'state', state: 'working' }, isApproval: false },
      { kind: 'reply', text: 'Found it' }
    ])
  })

  it('should show the last answer of a finished chat', () => {
    const idle = tab({ status: 'idle', messages: [prompt('p1', 'go'), answer('a1', 'All set?')] })
    expect(cardStepOf(idle)).toEqual({ kind: 'reply', text: 'All set?' })
  })
})

describe('cardStatusOf', () => {
  it('should tell a finished question from work, approval and start', () => {
    const asking = '> [!question] Braucht dich\n> Soll der Ordner weg?'
    expect([
      cardStatusOf(tab({ status: 'idle', messages: [answer('a1', asking)] })),
      cardStatusOf(tab({ status: 'working' })),
      cardStatusOf(tab({ status: 'asking' })),
      cardStatusOf(tab({ status: 'starting' })),
      cardStatusOf(tab({ status: 'idle' }))
    ]).toEqual(['question', 'working', 'asking', 'starting', 'working'])
  })
})
