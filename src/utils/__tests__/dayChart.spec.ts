import { describe, expect, it } from 'vitest'
import { axisTicksOf, barHeightOf, dayStatsOf, nextBarOf, valueOf } from '../dayChart'
import type { DayTokens } from '@/utils/usage'

const day = (key: string, opus: number, sonnet = 0, haiku = 0): DayTokens => ({
  day: key,
  byFamily: { opus, sonnet, haiku, other: 0 },
  total: opus + sonnet + haiku
})

const days = [
  day('2026-11-13', 200, 0, 10),
  day('2026-11-14', 0),
  day('2026-11-15', 1_500, 30, 5),
  day('2026-11-16', 100, 0, 15)
]

describe('axisTicksOf', () => {
  it('should step in round numbers up to the first tick at or above the maximum', () => {
    expect(axisTicksOf(1_500_000_000)).toEqual({
      top: 1_500_000_000,
      ticks: [0, 500_000_000, 1_000_000_000, 1_500_000_000]
    })
  })

  it('should add one step when the maximum lies between two ticks', () => {
    expect(axisTicksOf(1_620_000_000)).toEqual({
      top: 2_000_000_000,
      ticks: [0, 500_000_000, 1_000_000_000, 1_500_000_000, 2_000_000_000]
    })
  })

  it('should use 2.5 steps where they fit better', () => {
    expect(axisTicksOf(9_000_000)).toEqual({
      top: 10_000_000,
      ticks: [0, 2_500_000, 5_000_000, 7_500_000, 10_000_000]
    })
  })

  it('should keep whole-token steps for a range with only a few tokens', () => {
    expect([axisTicksOf(3), axisTicksOf(9)]).toEqual([
      { top: 3, ticks: [0, 1, 2, 3] },
      { top: 10, ticks: [0, 5, 10] }
    ])
  })

  it('should give a single zero tick when nothing was used', () => {
    expect(axisTicksOf(0)).toEqual({ top: 0, ticks: [0] })
  })
})

describe('valueOf', () => {
  it('should read the total for all models and the family for one', () => {
    expect([valueOf(days[2], 'all'), valueOf(days[2], 'haiku')]).toEqual([1_535, 5])
  })
})

describe('dayStatsOf', () => {
  it('should average over every day of the range and name the busiest day', () => {
    expect(dayStatsOf(days, 'all')).toEqual({
      total: 1_860,
      average: 465,
      peak: { day: '2026-11-15', value: 1_535 }
    })
  })

  it('should follow the focused model', () => {
    expect(dayStatsOf(days, 'haiku')).toEqual({
      total: 30,
      average: 8,
      peak: { day: '2026-11-16', value: 15 }
    })
  })

  it('should have no peak when nothing was used', () => {
    expect(dayStatsOf([day('2026-11-16', 0)], 'all')).toEqual({ total: 0, average: 0, peak: null })
  })
})

describe('barHeightOf', () => {
  it('should scale a bar to the plot', () => {
    expect(barHeightOf(750, 1_500, 200, 4)).toBe(100)
  })

  it('should keep a tiny day at the minimum height', () => {
    expect(barHeightOf(1, 1_500, 200, 4)).toBe(4)
  })

  it('should draw nothing for an idle day', () => {
    expect(barHeightOf(0, 1_500, 200, 4)).toBe(0)
  })
})

describe('nextBarOf', () => {
  it('should move one day with the arrows and stop at the ends', () => {
    expect([
      nextBarOf('ArrowLeft', 0, 14),
      nextBarOf('ArrowRight', 5, 14),
      nextBarOf('ArrowRight', 13, 14)
    ]).toEqual([0, 6, 13])
  })

  it('should jump to the first and last day with Home and End', () => {
    expect([nextBarOf('Home', 7, 14), nextBarOf('End', 7, 14)]).toEqual([0, 13])
  })

  it('should ignore other keys', () => {
    expect(nextBarOf('Enter', 7, 14)).toBeNull()
  })
})
