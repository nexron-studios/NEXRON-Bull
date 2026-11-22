import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types/agentd.type'
import { chatMarkdownOf } from '../chatExport'

const LABELS = { user: 'Du', claude: 'Claude', image: 'Bild' }
const FENCE = '```'

describe('chatMarkdownOf', () => {
  it('should write who said what and leave tool output and reasoning out', () => {
    const messages: ChatMessage[] = [
      {
        uuid: 'u1',
        role: 'user',
        at: null,
        blocks: [
          { type: 'shell', command: 'git status' },
          { type: 'shell_output', stdout: 'clean', stderr: '' },
          { type: 'text', text: 'Commit it' }
        ]
      },
      {
        uuid: 'a1',
        role: 'assistant',
        at: null,
        blocks: [
          { type: 'thinking', text: 'hm' },
          { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
          { type: 'text', text: 'Done.' }
        ]
      },
      {
        uuid: 'r1',
        role: 'user',
        at: null,
        blocks: [{ type: 'tool_result', tool_use_id: 't1', is_error: false, content: [] }]
      }
    ]
    expect(chatMarkdownOf(messages, LABELS)).toBe(
      [
        '## Du',
        `${FENCE}sh\n$ git status\n${FENCE}`,
        `${FENCE}\nclean\n${FENCE}`,
        'Commit it',
        '## Claude',
        '`Bash`',
        'Done.'
      ].join('\n\n')
    )
  })
})
