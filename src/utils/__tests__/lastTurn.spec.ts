import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { answeredTurnTextOf, lastTurnTextOf } from '../lastTurn'

const FOUR_MINUTES_TEN = 250_000

describe('lastTurnTextOf', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'de'
  })

  it('should name tools, subagents and duration', () => {
    const text = lastTurnTextOf(
      { tools: 14, calls: 14, subagents: 3, durationMs: FOUR_MINUTES_TEN, endedAt: null },
      i18n.global.t
    )

    expect(text).toBe('Letzter Turn: 14 Tools, 3 Subagents, 4:10 min')
  })

  it('should leave the subagents out when there were none', () => {
    const text = lastTurnTextOf(
      { tools: 14, calls: 14, subagents: 0, durationMs: FOUR_MINUTES_TEN, endedAt: null },
      i18n.global.t
    )

    expect(text).toBe('Letzter Turn: 14 Tools, 4:10 min')
  })

  it('should keep a turn without tools as 0 tools', () => {
    const text = lastTurnTextOf(
      { tools: 0, calls: 0, subagents: 0, durationMs: null, endedAt: null },
      i18n.global.t
    )

    expect(text).toBe('Letzter Turn: 0 Tools')
  })

  it('should leave the duration out without times', () => {
    const text = lastTurnTextOf(
      { tools: 1, calls: 1, subagents: 1, durationMs: null, endedAt: null },
      i18n.global.t
    )

    expect(text).toBe('Letzter Turn: 1 Tool, 1 Subagent')
  })

  it('should read the same in English', () => {
    i18n.global.locale.value = 'en'

    const text = lastTurnTextOf(
      { tools: 2, calls: 2, subagents: 0, durationMs: FOUR_MINUTES_TEN, endedAt: null },
      i18n.global.t
    )

    expect(text).toBe('Last turn: 2 tools, 4:10 min')
  })
})

describe('answeredTurnTextOf', () => {
  // 14:32 local time, so the test reads the same in every time zone.
  const AT_14_32 = new Date(2026, 10, 20, 14, 32).getTime()
  const THREE_SECONDS = 3_000
  const LATER_THAT_DAY = new Date(2026, 10, 20, 18, 0).getTime()
  const NEXT_DAY = new Date(2026, 10, 21, 9, 0).getTime()

  beforeEach(() => {
    i18n.global.locale.value = 'de'
  })

  it('should name when the turn ended and how long it took', () => {
    const text = answeredTurnTextOf(
      { tools: 0, calls: 0, subagents: 0, durationMs: THREE_SECONDS, endedAt: AT_14_32 },
      i18n.global.t,
      'de',
      LATER_THAT_DAY
    )

    expect(text).toBe('Letzter Turn um 14:32, 0:03 min')
  })

  it('should leave out the duration when the prompt had no time', () => {
    const text = answeredTurnTextOf(
      { tools: 0, calls: 0, subagents: 0, durationMs: null, endedAt: AT_14_32 },
      i18n.global.t,
      'de',
      LATER_THAT_DAY
    )

    expect(text).toBe('Letzter Turn um 14:32')
  })

  it('should give nothing without any time', () => {
    const text = answeredTurnTextOf(
      { tools: 0, calls: 0, subagents: 0, durationMs: null, endedAt: null },
      i18n.global.t,
      'de',
      LATER_THAT_DAY
    )

    expect(text).toBe(null)
  })

  it('should name the day of a turn that ended before today', () => {
    const text = answeredTurnTextOf(
      { tools: 0, calls: 0, subagents: 0, durationMs: THREE_SECONDS, endedAt: AT_14_32 },
      i18n.global.t,
      'de',
      NEXT_DAY
    )

    expect(text).toBe('Letzter Turn am 20. Nov. um 14:32, 0:03 min')
  })
})
