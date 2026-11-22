import { describe, expect, it } from 'vitest'
import {
  liveTurnTokensOf,
  modelLabelOf,
  outputTokensOf,
  tokenCountFormatterOf,
  turnDurationOf,
  turnStatsOf
} from '../turnStats'
import type { ChatMessage, MessageUsage } from '@/types/agentd.type'

const usage = (output: number, id?: string): MessageUsage => ({
  model: 'claude-opus-5-5',
  ...(id ? { id } : {}),
  input: 3,
  output,
  cache_read: 1000 + output,
  cache_write: 0
})

const reply = (uuid: string, used: MessageUsage, at: string | null = null): ChatMessage => ({
  uuid,
  role: 'assistant',
  at,
  blocks: [{ type: 'text', text: uuid }],
  usage: used
})

describe('outputTokensOf', () => {
  it('should count a call split into several lines once', () => {
    const lines = [reply('a1', usage(300, 'msg_1')), reply('a2', usage(300, 'msg_1'))]
    expect(outputTokensOf([...lines, reply('a3', usage(50, 'msg_2'))], {})).toBe(350)
  })

  it('should count lines of an older agentd without ids once per call', () => {
    expect(outputTokensOf([reply('a1', usage(40)), reply('a2', usage(40))], {})).toBe(40)
  })

  it('should take the final count the stream reported for a call', () => {
    expect(outputTokensOf([reply('a1', usage(1, 'msg_1'))], { msg_1: 812 })).toBe(812)
  })
})

describe('liveTurnTokensOf', () => {
  it('should add about a token per four streamed characters', () => {
    expect(liveTurnTokensOf([reply('a1', usage(100, 'msg_1'))], {}, 41)).toBe(111)
  })
})

describe('turnStatsOf', () => {
  it('should measure from the prompt to the last reply', () => {
    const prompt: ChatMessage = {
      uuid: 'p1',
      role: 'user',
      at: '2026-11-18T10:00:00Z',
      blocks: [{ type: 'text', text: 'Go' }]
    }
    const turn = [prompt, reply('a1', usage(200, 'msg_1'), '2026-11-18T10:04:12Z')]
    expect(turnStatsOf(turn, {})).toEqual({
      durationMs: 252_000,
      outputTokens: 200,
      model: 'claude-opus-5-5'
    })
  })

  it('should give null for a turn without a reply', () => {
    expect(turnStatsOf([], {})).toBeNull()
  })
})

describe('modelLabelOf', () => {
  it('should name family and version like the terminal', () => {
    expect(modelLabelOf('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelLabelOf('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelLabelOf('claude-sonnet-4-5[1m]')).toBe('Sonnet 4.5')
  })

  it('should fall back to the family or the id itself', () => {
    expect(modelLabelOf('claude-3-5-sonnet-20241022')).toBe('Sonnet')
    expect(modelLabelOf('gpt-x')).toBe('gpt-x')
  })
})

describe('tokenCountFormatterOf', () => {
  it('should shorten thousands like the status line', () => {
    const format = tokenCountFormatterOf('de')
    expect([format(812), format(4200), format(18_240), format(1_250_000)]).toEqual([
      '812',
      '4,2k',
      '18,2k',
      '1,3M'
    ])
  })
})

describe('turnDurationOf', () => {
  it('should pick seconds, minutes or hours', () => {
    expect(turnDurationOf(42_000)).toEqual({ unit: 'seconds', time: '42' })
    expect(turnDurationOf(252_000)).toEqual({ unit: 'minutes', time: '4:12' })
    expect(turnDurationOf(3_720_000)).toEqual({ unit: 'hours', time: '1:02' })
  })
})
