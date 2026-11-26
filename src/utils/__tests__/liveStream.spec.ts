import { describe, expect, it } from 'vitest'
import { applyEvent, newTab, type ChatTabState } from '../chatTab'
import {
  appendedTo,
  isSubagentStream,
  isTokenEvent,
  liveActivityOf,
  NO_LIVE_BLOCK
} from '../liveStream'
import type { AgentdEvent, ClaudeEvent } from '@/types/agentd.type'
import fixtureJson from '../../../agentd/tests/fixtures/stream_replay.json?raw'

/** One case of the fixture agentd's `partial_reply` tests read too. */
interface ReplayCase {
  name: string
  events: ClaudeEvent[]
  replay: Extract<AgentdEvent, { type: 'stream_replay' }> | null
}

const cases = JSON.parse(fixtureJson) as ReplayCase[]

const tab = (): ChatTabState =>
  newTab({
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
  })

/** What the app shows after Claude's lines, as agentd's pump hands them over. */
const folded = (events: ClaudeEvent[]): ChatTabState =>
  events.reduce<ChatTabState>(
    (shown, event) =>
      event.type === 'assistant'
        ? applyEvent(shown, {
            type: 'message',
            tab: 't1',
            message: { uuid: String(event.uuid), role: 'assistant', at: null, blocks: [] }
          })
        : applyEvent(shown, { type: 'claude', tab: 't1', event }),
    tab()
  )

describe('appendedTo', () => {
  it('should start a reply only once it has text', () => {
    expect([
      appendedTo(NO_LIVE_BLOCK, 'writing', ''),
      appendedTo(NO_LIVE_BLOCK, 'thinking', ''),
      appendedTo({ kind: 'writing', text: 'Hal' }, 'writing', 'lo')
    ]).toEqual([
      { kind: 'none' },
      { kind: 'thinking', text: '' },
      { kind: 'writing', text: 'Hallo' }
    ])
  })

  it('should start a new block when the other kind streams', () => {
    expect(appendedTo({ kind: 'thinking', text: 'Erst lesen.' }, 'writing', 'Hallo')).toEqual({
      kind: 'writing',
      text: 'Hallo'
    })
  })

  it('should keep a cut block cut', () => {
    expect(appendedTo({ kind: 'cut', of: 'writing' }, 'writing', 'mehr')).toEqual({
      kind: 'cut',
      of: 'writing'
    })
  })
})

describe('liveActivityOf', () => {
  it('should name what Claude streams, for a cut block what it was', () => {
    expect([
      liveActivityOf(NO_LIVE_BLOCK),
      liveActivityOf({ kind: 'thinking', text: '' }),
      liveActivityOf({ kind: 'writing', text: 'Hallo' }),
      liveActivityOf({ kind: 'cut', of: 'thinking' })
    ]).toEqual([null, 'thinking', 'writing', 'thinking'])
  })
})

describe('the replay agentd derives from the same events', () => {
  it.each(cases)('should match what the app shows: $name', ({ events, replay }) => {
    const shown = folded(events)
    expect([shown.live, shown.streamUsage.chars]).toEqual([
      replay?.block ?? NO_LIVE_BLOCK,
      replay?.chars ?? 0
    ])
  })
})

describe('isTokenEvent', () => {
  const streamed = (inner: string, parent: string | null = null): AgentdEvent => ({
    type: 'claude',
    tab: 't1',
    event: { type: 'stream_event', parent_tool_use_id: parent, event: { type: inner } }
  })

  it('should take a delta of Claude itself as a token', () => {
    expect(isTokenEvent(streamed('content_block_delta'))).toBe(true)
  })

  it('should not take the start of a message as a token', () => {
    expect(isTokenEvent(streamed('message_start'))).toBe(false)
  })

  it("should not take a subagent's delta as a token, but as a subagent stream", () => {
    const event = streamed('content_block_delta', 'agent-1')
    expect([isTokenEvent(event), isSubagentStream(event)]).toEqual([false, true])
  })
})
