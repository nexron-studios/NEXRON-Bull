import { describe, expect, it } from 'vitest'
import { pickQuip, quipMoodOf, quipPoolOf, shouldReplaceQuip } from '../quips'
import { newTab, type ChatTabState } from '../chatTab'

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

const running = { kind: 'tool', activity: 'runs', tool: 'Bash', target: 'npm test' } as const

describe('quipMoodOf', () => {
  it('should map thinking, writing and tool calls to their mood', () => {
    expect([
      quipMoodOf(tab(), { kind: 'thinking' }),
      quipMoodOf(tab(), { kind: 'writing' }),
      quipMoodOf(tab(), running),
      quipMoodOf(tab(), { kind: 'working' })
    ]).toEqual(['thinking', 'writing', 'working', 'working'])
  })

  it('should give no mood while Claude waits for the user', () => {
    expect(quipMoodOf(tab(), { kind: 'asking' })).toBe(null)
  })

  it('should give no mood while Claude Code retries an API call', () => {
    const retry = {
      attempt: 1,
      maxRetries: 10,
      status: 529,
      reason: 'overloaded',
      retriesAt: 0
    } as const
    expect(quipMoodOf(tab({ retry }), running)).toBe(null)
  })
})

describe('quipPoolOf', () => {
  it('should mix the long-turn quips in only for a long turn', () => {
    expect(quipPoolOf('writing', false)).toEqual([
      'Wordsmithing…',
      'Scribbling…',
      'Penning…',
      'Spinning a yarn…'
    ])
    expect(quipPoolOf('writing', true)).toContain('Still chewing…')
  })
})

describe('shouldReplaceQuip', () => {
  const shown = { text: 'Ruminating…', mood: 'thinking', shownAt: 0 } as const

  it('should show the first quip at once', () => {
    expect(shouldReplaceQuip(null, 'thinking', 0, true)).toBe(true)
  })

  it('should keep a quip through a mood change that comes before 2 s', () => {
    expect(shouldReplaceQuip(shown, 'working', 1999, true)).toBe(false)
    expect(shouldReplaceQuip(shown, 'working', 2000, true)).toBe(true)
  })

  it('should rotate within one mood only after 6 s', () => {
    expect(shouldReplaceQuip(shown, 'thinking', 5999, true)).toBe(false)
    expect(shouldReplaceQuip(shown, 'thinking', 6000, true)).toBe(true)
  })

  it('should not rotate with less motion, but still follow a mood change', () => {
    expect(shouldReplaceQuip(shown, 'thinking', 60_000, false)).toBe(false)
    expect(shouldReplaceQuip(shown, 'writing', 2000, false)).toBe(true)
  })
})

describe('pickQuip', () => {
  it('should never pick the quip that shows right now', () => {
    expect(pickQuip(['A…', 'B…', 'C…'], 'A…', () => 0)).toBe('B…')
  })

  it('should pick by the random number', () => {
    expect(pickQuip(['A…', 'B…', 'C…'], null, () => 0.99)).toBe('C…')
  })

  it('should keep the only quip of a pool of one', () => {
    expect(pickQuip(['A…'], 'A…', () => 0.5)).toBe('A…')
  })
})
