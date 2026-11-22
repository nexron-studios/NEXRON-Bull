import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types/agentd.type'
import { promptTextsOf } from '../promptHistory'

const message = (role: ChatMessage['role'], blocks: ChatMessage['blocks']): ChatMessage => ({
  uuid: crypto.randomUUID(),
  role,
  at: null,
  blocks
})

describe('promptTextsOf', () => {
  it('should list the typed prompts oldest first, a repeat in a row once', () => {
    const messages = [
      message('user', [{ type: 'text', text: 'first' }]),
      message('assistant', [{ type: 'text', text: 'answer' }]),
      message('user', [{ type: 'command', name: '/compact', args: 'notes' }]),
      message('user', [{ type: 'tool_result', tool_use_id: 't', is_error: false, content: [] }]),
      message('user', [{ type: 'text', text: 'again' }]),
      message('user', [{ type: 'text', text: 'again' }])
    ]
    expect(promptTextsOf(messages)).toEqual(['first', '/compact notes', 'again'])
  })

  it('should leave the shell output out of the prompt it came with', () => {
    const sent = message('user', [
      { type: 'shell', command: 'git status' },
      { type: 'shell_output', stdout: 'clean', stderr: '' },
      { type: 'text', text: 'commit it' }
    ])
    expect(promptTextsOf([sent])).toEqual(['commit it'])
  })
})
