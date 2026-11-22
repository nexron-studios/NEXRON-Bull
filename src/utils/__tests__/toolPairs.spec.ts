import { describe, expect, it } from 'vitest'
import { resultsByToolId, visibleMessages } from '../toolPairs'
import type { ChatMessage } from '@/types/agentd.type'

const call: ChatMessage = {
  uuid: 'a1',
  role: 'assistant',
  at: null,
  blocks: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]
}
const result: ChatMessage = {
  uuid: 'u1',
  role: 'user',
  at: null,
  blocks: [{ type: 'tool_result', tool_use_id: 't1', is_error: false, content: [] }]
}
const orphan: ChatMessage = {
  uuid: 'u2',
  role: 'user',
  at: null,
  blocks: [{ type: 'tool_result', tool_use_id: 'gone', is_error: true, content: [] }]
}

describe('resultsByToolId', () => {
  it('should find the result of a call by its id', () => {
    expect(resultsByToolId([call, result]).get('t1')?.is_error).toBe(false)
  })
})

describe('visibleMessages', () => {
  it('should hide results that belong to a shown call and keep orphans', () => {
    expect(visibleMessages([call, result, orphan]).map((m) => m.uuid)).toEqual(['a1', 'u2'])
  })
})
