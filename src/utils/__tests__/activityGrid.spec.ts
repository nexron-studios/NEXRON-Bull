import { describe, expect, it } from 'vitest'
import {
  activityDaysOf,
  activityWeeksOf,
  levelBoundsOf,
  levelOf,
  monthStartsOf,
  parseActivityMetric,
  peakDayOf,
  recentProjectsOf,
  recentToolsOf,
  streaksOf,
  type ActivityDay
} from '../activityGrid'
import type { MachineUsage } from '../usage'
import type { UsageRow } from '@/types/agentd.type'

const row = (day: string, project: string, output: number): UsageRow => ({
  day,
  model: 'opus',
  project,
  input: 0,
  output,
  cache_read: 0,
  cache_write: 0
})

const usage: MachineUsage[] = [
  {
    machine: null,
    rows: [
      row('2026-11-18', 'C:\\dev\\bull', 300),
      row('2026-11-18', 'C:\\dev\\kramlos', 100),
      row('2026-11-19', 'C:\\dev\\bull', 50)
    ],
    tools: [
      { day: '2026-11-18', project: 'C:\\dev\\bull', tool: 'Bash', calls: 4 },
      {
        day: '2026-11-18',
        project: 'C:\\dev\\bull',
        tool: 'mcp__claude_ai_Figma__use_figma',
        calls: 2
      },
      {
        day: '2026-11-19',
        project: 'C:\\dev\\bull',
        tool: 'mcp__claude_ai_Figma__get_screenshot',
        calls: 3
      }
    ],
    sessions: [
      { day: '2026-11-18', project: 'C:\\dev\\bull', sessions: 2 },
      { day: '2026-11-18', project: 'C:\\dev\\kramlos', sessions: 1 }
    ]
  },
  {
    machine: 'nexron-server',
    rows: [row('2026-10-01', '/srv/homeserver', 999)],
    tools: [],
    sessions: [{ day: '2026-10-01', project: '/srv/homeserver', sessions: 1 }]
  }
]

const day = (key: string, tokens: number): ActivityDay => ({
  day: key,
  tokens,
  sessions: 0,
  tools: 0,
  projects: []
})

describe('parseActivityMetric', () => {
  it('should fall back to tokens for anything it does not know', () => {
    expect([
      parseActivityMetric('tools'),
      parseActivityMetric('x'),
      parseActivityMetric(undefined)
    ]).toEqual(['tools', 'tokens', 'tokens'])
  })
})

describe('activityWeeksOf', () => {
  it('should end with the week of today, Monday first, empty after today', () => {
    // Thursday, 19 November 2026
    const weeks = activityWeeksOf(new Date(2026, 10, 19), 2)
    expect(weeks).toEqual([
      [
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
        '2026-11-12',
        '2026-11-13',
        '2026-11-14',
        '2026-11-15'
      ],
      ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', null, null, null]
    ])
  })
})

describe('monthStartsOf', () => {
  it('should mark the week in which a month begins', () => {
    const weeks = activityWeeksOf(new Date(2026, 11, 2), 2)
    expect(monthStartsOf(weeks)).toEqual([{ week: 1, month: 11 }])
  })
})

describe('activityDaysOf', () => {
  it('should add tokens, sessions and tool calls of every machine per day', () => {
    const days = activityDaysOf(usage)
    expect(days.get('2026-11-18')).toEqual({
      day: '2026-11-18',
      tokens: 400,
      sessions: 3,
      tools: 6,
      projects: ['bull', 'kramlos']
    })
    expect(days.get('2026-10-01')?.projects).toEqual(['homeserver'])
  })
})

describe('levelOf', () => {
  it('should put days into quarters of the days with use', () => {
    const bounds = levelBoundsOf([0, 10, 20, 30, 40])
    expect([0, 10, 20, 30, 40].map((value) => levelOf(value, bounds))).toEqual([0, 1, 2, 3, 4])
  })
})

describe('streaksOf', () => {
  it('should keep the current streak while today has no use yet', () => {
    const days = new Map(
      ['2026-11-14', '2026-11-16', '2026-11-17', '2026-11-18'].map((key) => [key, day(key, 1)])
    )
    const axis = [
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19'
    ]
    expect(streaksOf(days, axis)).toEqual({ current: 3, longest: 3 })
  })
})

describe('peakDayOf', () => {
  it('should find the day with the most of the metric', () => {
    expect(peakDayOf(activityDaysOf(usage), ['2026-10-01', '2026-11-18'], 'tokens')?.day).toBe(
      '2026-10-01'
    )
  })
})

describe('recentProjectsOf', () => {
  it('should list projects of the range by tokens with their sessions', () => {
    expect(recentProjectsOf(usage, '2026-11-01')).toEqual([
      { path: 'C:\\dev\\bull', name: 'bull', tokens: 350, sessions: 2 },
      { path: 'C:\\dev\\kramlos', name: 'kramlos', tokens: 100, sessions: 1 }
    ])
  })
})

describe('recentToolsOf', () => {
  it('should count an MCP server as one tool under its short name', () => {
    expect(recentToolsOf(usage, '2026-11-01')).toEqual([
      { tool: 'mcp__figma', label: 'Figma', calls: 5 },
      { tool: 'Bash', label: 'Bash', calls: 4 }
    ])
  })

  it('should keep a server name with several words and merge plugin and connector', () => {
    const machines: MachineUsage[] = [
      {
        machine: null,
        rows: [],
        sessions: [],
        tools: [
          {
            day: '2026-11-18',
            project: '',
            tool: 'mcp__claude_ai_Google_Calendar__list_events',
            calls: 1
          },
          { day: '2026-11-18', project: '', tool: 'mcp__plugin_figma_figma__use_figma', calls: 2 },
          { day: '2026-11-18', project: '', tool: 'mcp__claude_ai_Figma__get_screenshot', calls: 3 }
        ]
      }
    ]
    expect(recentToolsOf(machines, '2026-11-01').map((tool) => [tool.label, tool.calls])).toEqual([
      ['Figma', 5],
      ['Google Calendar', 1]
    ])
  })
})

describe('peakDayOf on the grid only', () => {
  it('should ignore fetched days that have no square', () => {
    expect(peakDayOf(activityDaysOf(usage), ['2026-11-18', '2026-11-19'], 'tokens')?.day).toBe(
      '2026-11-18'
    )
  })
})
