import { describe, expect, it } from 'vitest'
import {
  rememberedListOf,
  rememberedOf,
  withRemembered,
  withoutSession
} from '../rememberedSettings'

const AUTO_XHIGH = { model: 'opus', effort: 'xhigh', permissionMode: 'auto' } as const
const NOTHING = { model: null, effort: null, permissionMode: null }

describe('withRemembered', () => {
  it('should keep the newest choice of a session last, once', () => {
    const before = [
      { sessionId: 's1', model: 'haiku', effort: null, permissionMode: null },
      { sessionId: 's2', model: null, effort: 'low', permissionMode: 'plan' as const }
    ]

    expect(withRemembered(before, 's1', AUTO_XHIGH)).toEqual([
      { sessionId: 's2', model: null, effort: 'low', permissionMode: 'plan' },
      { sessionId: 's1', model: 'opus', effort: 'xhigh', permissionMode: 'auto' }
    ])
  })

  it('should forget a session closed with nothing chosen', () => {
    const before = [{ sessionId: 's1', ...AUTO_XHIGH }]

    expect(withRemembered(before, 's1', NOTHING)).toEqual([])
  })

  it('should drop the oldest sessions past the cap', () => {
    const before = [
      { sessionId: 's1', ...AUTO_XHIGH },
      { sessionId: 's2', ...AUTO_XHIGH }
    ]

    expect(withRemembered(before, 's3', AUTO_XHIGH, 2).map((entry) => entry.sessionId)).toEqual([
      's2',
      's3'
    ])
  })
})

describe('withoutSession', () => {
  it('should drop only the given session', () => {
    const before = [
      { sessionId: 's1', ...AUTO_XHIGH },
      { sessionId: 's2', ...AUTO_XHIGH }
    ]

    expect(withoutSession(before, 's1').map((entry) => entry.sessionId)).toEqual(['s2'])
  })
})

describe('rememberedListOf', () => {
  it('should keep valid entries and drop broken ones from storage', () => {
    const stored = [
      { sessionId: 's1', model: 'opus', effort: 'xhigh', permissionMode: 'auto' },
      { sessionId: 's2', model: null, effort: null, permissionMode: 'yolo' },
      { sessionId: 3, model: null, effort: null, permissionMode: null },
      { sessionId: 's4', model: 4, effort: null, permissionMode: null },
      'junk'
    ]

    expect(rememberedListOf(stored)).toEqual([
      { sessionId: 's1', model: 'opus', effort: 'xhigh', permissionMode: 'auto' }
    ])
    expect(rememberedListOf({ remembered: [] })).toEqual([])
  })
})

describe('rememberedOf', () => {
  it('should give the last choice of a session, nothing chosen for an unknown one', () => {
    const remembered = [{ sessionId: 's1', ...AUTO_XHIGH }]

    expect(rememberedOf(remembered, 's1')).toEqual({
      model: 'opus',
      effort: 'xhigh',
      permissionMode: 'auto'
    })
    expect(rememberedOf(remembered, 's9')).toEqual(NOTHING)
  })
})
