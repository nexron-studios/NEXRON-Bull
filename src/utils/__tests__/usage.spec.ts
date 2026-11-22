import { describe, expect, it } from 'vitest'
import {
  dayAxis,
  labelStepOf,
  parseUsageRange,
  projectNameOf,
  projectShares,
  sumOfDays,
  tokensPerDay,
  tokensPerMachine,
  totalOf,
  withinDays,
  type MachineUsage
} from '../usage'
import type { UsageRow } from '@/types/agentd.type'

const row = (day: string, model: UsageRow['model'], project: string, output: number): UsageRow => ({
  day,
  model,
  project,
  input: 1,
  output,
  cache_read: 10,
  cache_write: 0
})

const usage: MachineUsage[] = [
  {
    machine: null,
    rows: [
      row('2026-11-14', 'opus', 'C:\\dev\\bull', 89),
      row('2026-11-15', 'opus', 'C:\\dev\\bull', 189),
      row('2026-11-15', 'haiku', 'C:\\dev\\kramlos', 39)
    ],
    tools: [],
    sessions: []
  },
  {
    machine: 'nexron-server',
    rows: [row('2026-11-15', 'sonnet', 'C:\\srv', 489)],
    tools: [],
    sessions: []
  }
]

describe('parseUsageRange', () => {
  it('should accept the offered ranges from the URL', () => {
    expect(parseUsageRange('30')).toBe(30)
  })

  it('should fall back to 14 days for anything else', () => {
    expect([parseUsageRange('8'), parseUsageRange(undefined), parseUsageRange('x')]).toEqual([
      14, 14, 14
    ])
  })
})

describe('totalOf', () => {
  it('should add input, output and both cache directions', () => {
    expect(totalOf({ input: 1, output: 2, cache_read: 30, cache_write: 400 })).toBe(433)
  })
})

describe('dayAxis', () => {
  it('should list the local days of the range, oldest first, across a month end', () => {
    expect(dayAxis(3, new Date(2026, 11, 1, 9, 30))).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01'
    ])
  })
})

describe('tokensPerDay', () => {
  it('should sum every machine per day and model and keep empty days', () => {
    const days = tokensPerDay(usage, ['2026-11-13', '2026-11-14', '2026-11-15'])
    expect(days).toEqual([
      { day: '2026-11-13', byFamily: { opus: 0, sonnet: 0, haiku: 0, other: 0 }, total: 0 },
      { day: '2026-11-14', byFamily: { opus: 100, sonnet: 0, haiku: 0, other: 0 }, total: 100 },
      {
        day: '2026-11-15',
        byFamily: { opus: 200, sonnet: 500, haiku: 50, other: 0 },
        total: 750
      }
    ])
    expect(sumOfDays(days)).toBe(850)
  })

  it('should leave out rows outside the axis', () => {
    expect(tokensPerDay(usage, ['2026-11-14'])[0]?.total).toBe(100)
  })
})

describe('withinDays', () => {
  it('should keep only the rows of the axis, per machine', () => {
    const kept = withinDays(usage, ['2026-11-14'])
    expect(kept.map(({ machine, rows }) => [machine, rows.length])).toEqual([
      [null, 1],
      ['nexron-server', 0]
    ])
  })
})

describe('projectNameOf', () => {
  it('should show the last folder of a Windows or POSIX path', () => {
    expect([projectNameOf('C:\\me\\dev\\bull'), projectNameOf('/home/j/kramlos/')]).toEqual([
      'bull',
      'kramlos'
    ])
  })
})

describe('projectShares', () => {
  it('should rank projects and fold the rest into one entry', () => {
    expect(projectShares(usage, 2)).toEqual([
      { path: 'C:\\srv', name: 'srv', tokens: 500, share: 500 / 850 },
      { path: 'C:\\dev\\bull', name: 'bull', tokens: 300, share: 300 / 850 },
      { path: null, name: '', tokens: 50, share: 50 / 850 }
    ])
  })

  it('should give nothing when no tokens were used', () => {
    expect(projectShares([{ machine: null, rows: [], tools: [], sessions: [] }])).toEqual([])
  })
})

describe('tokensPerMachine', () => {
  it('should sum each machine by model', () => {
    expect(tokensPerMachine(usage)).toEqual([
      { machine: null, byFamily: { opus: 300, sonnet: 0, haiku: 50, other: 0 }, total: 350 },
      {
        machine: 'nexron-server',
        byFamily: { opus: 0, sonnet: 500, haiku: 0, other: 0 },
        total: 500
      }
    ])
  })
})

describe('labelStepOf', () => {
  it('should label every day when they fit and thin out longer ranges', () => {
    expect([labelStepOf(7, 15), labelStepOf(30, 15), labelStepOf(30, 6)]).toEqual([1, 2, 5])
  })
})
