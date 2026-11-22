import { describe, expect, it } from 'vitest'
import { agentTitlesOf, isAgentMessage, withAgentTitles } from '../agentMessages'
import type { ChatMessage } from '@/types/agentd.type'

// As agentd hands them over: the Agent call, Claude Code's launch answer, the hand-back.
const call: ChatMessage = {
  uuid: 'a1',
  role: 'assistant',
  at: null,
  blocks: [
    {
      type: 'tool_use',
      id: 'toolu_1',
      name: 'Agent',
      input: { description: 'Ping check', subagent_type: 'general-purpose' }
    }
  ]
}
const launched: ChatMessage = {
  uuid: 'u1',
  role: 'user',
  at: null,
  blocks: [
    {
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      is_error: false,
      content: [
        {
          type: 'text',
          text: 'Async agent launched successfully.\nagentId: a444072e1eecc1107 (internal ID)'
        }
      ]
    }
  ]
}
const report = (name: string | null, from = 'a444072e1eecc1107'): ChatMessage => ({
  uuid: 'r1',
  role: 'system',
  at: null,
  blocks: [{ type: 'agent_message', from, name, text: 'Ping finished.', is_report: true }]
})

describe('isAgentMessage', () => {
  it('should tell a report from a typed prompt', () => {
    const typed: ChatMessage = { ...launched, blocks: [{ type: 'text', text: 'Hallo' }] }
    expect([
      isAgentMessage(report(null)),
      isAgentMessage(typed),
      isAgentMessage(undefined)
    ]).toEqual([true, false, false])
  })
})

describe('agentTitlesOf', () => {
  it('should map the agent id from the launch answer to the call description', () => {
    expect([...agentTitlesOf([call, launched])]).toEqual([['a444072e1eecc1107', 'Ping check']])
  })
})

describe('withAgentTitles', () => {
  it('should name a report after the description its subagent got', () => {
    const named = withAgentTitles([call, launched, report(null)])
    expect(named[2].blocks).toEqual([
      {
        type: 'agent_message',
        from: 'a444072e1eecc1107',
        name: 'Ping check',
        text: 'Ping finished.',
        is_report: true
      }
    ])
  })

  it('should keep the written type when the call is not loaded', () => {
    expect(withAgentTitles([report('Explore', 'a999')])[0].blocks[0]).toMatchObject({
      name: 'Explore'
    })
  })

  it('should hand back the same list when there is no report', () => {
    const messages = [call, launched]
    expect(withAgentTitles(messages)).toBe(messages)
  })
})
