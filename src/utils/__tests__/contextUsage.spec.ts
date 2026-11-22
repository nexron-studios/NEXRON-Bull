import { describe, expect, it } from 'vitest'
import {
  autoCompactLeftOf,
  compactCommandOf,
  contextLevelOf,
  contextReportOf,
  loadedRowsOf,
  shortPathOf,
  tokenFormatterOf
} from '../contextUsage'

// Trimmed from a real `get_context_usage` answer of Claude Code 2.1.327.
const response = {
  categories: [
    { id: 'system_prompt', tokens: 3425, kind: 'used' },
    { id: 'system_tools', tokens: 7926, kind: 'used' },
    { id: 'mcp_instructions', tokens: 2785, kind: 'used' },
    { id: 'mcp_tools_deferred', tokens: 173056, kind: 'deferred', isDeferred: true },
    { id: 'memory_files', tokens: 18124, kind: 'used' },
    { id: 'skills', tokens: 9893, kind: 'used' },
    { id: 'messages', tokens: 19658, kind: 'used' },
    { id: 'something_new', tokens: 100, kind: 'used' },
    { id: 'autocompact_buffer', tokens: 33000, kind: 'buffer' },
    { id: 'free_space', tokens: 905189, kind: 'free' }
  ],
  totalTokens: 61811,
  maxTokens: 1000000,
  memoryFiles: [{ path: 'C:\\Users\\me\\.claude\\CLAUDE.md', type: 'User', tokens: 261 }],
  skills: { totalSkills: 79, includedSkills: 79, tokens: 9893 },
  autoCompactThreshold: 967000,
  isAutoCompactEnabled: true
}

describe('contextReportOf', () => {
  it('should group the parts in context and leave out deferred tools', () => {
    expect(contextReportOf(response)?.shares).toEqual([
      { group: 'system_prompt', tokens: 3425 },
      { group: 'tools', tokens: 7926 },
      { group: 'mcp', tokens: 2785 },
      { group: 'memory', tokens: 18124 },
      { group: 'skills', tokens: 9893 },
      { group: 'messages', tokens: 19658 },
      { group: 'other', tokens: 100 }
    ])
  })

  it('should carry totals, reserve, files, skills and the auto-compact point', () => {
    const report = contextReportOf(response)
    expect(report && { ...report, shares: undefined }).toEqual({
      tokens: 61811,
      window: 1000000,
      percent: 6,
      shares: undefined,
      buffer: 33000,
      free: 905189,
      memoryFiles: [{ path: 'C:\\Users\\me\\.claude\\CLAUDE.md', tokens: 261 }],
      skills: { count: 79, tokens: 9893 },
      autoCompactAt: 967000
    })
  })

  it('should give no auto-compact point when auto-compact is off', () => {
    expect(contextReportOf({ ...response, isAutoCompactEnabled: false })?.autoCompactAt).toBe(null)
  })

  it('should refuse an answer without totals', () => {
    expect(contextReportOf({ categories: [] })).toBe(null)
    expect(contextReportOf('nope')).toBe(null)
  })
})

describe('autoCompactLeftOf', () => {
  it('should stay quiet while compaction is more than 20k tokens away', () => {
    expect(autoCompactLeftOf(140_000, 167_000)).toBe(null)
  })

  it('should count down the share left once it is near', () => {
    expect(autoCompactLeftOf(152_000, 167_000)).toBe(9)
  })

  it('should not go below zero past the point', () => {
    expect(autoCompactLeftOf(170_000, 167_000)).toBe(0)
  })
})

describe('contextLevelOf', () => {
  it('should turn yellow from 85 % and red from 95 %', () => {
    expect([84, 85, 94, 95].map(contextLevelOf)).toEqual(['normal', 'high', 'high', 'full'])
  })
})

describe('tokenFormatterOf', () => {
  it('should write tokens like /context does, in German', () => {
    const format = tokenFormatterOf('de')
    expect([812, 3125, 142_400, 176_000, 1_000_000].map(format)).toEqual([
      '812',
      '3,1k',
      '142,4k',
      '176k',
      '1M'
    ])
  })
})

describe('compactCommandOf', () => {
  it('should add the focus after /compact, trimmed', () => {
    expect(compactCommandOf('  keep the header  ')).toBe('/compact keep the header')
  })

  it('should send a bare /compact without focus', () => {
    expect(compactCommandOf('   ')).toBe('/compact')
  })
})

describe('shortPathOf', () => {
  it('should shorten the home folder on Windows and macOS', () => {
    expect(shortPathOf('C:\\Users\\Home\\.claude\\CLAUDE.md')).toBe('~/.claude/CLAUDE.md')
    expect(shortPathOf('/Users/alex/dev/app/CLAUDE.md')).toBe('~/dev/app/CLAUDE.md')
  })
})

describe('loadedRowsOf', () => {
  it('should list CLAUDE.md files alone and group imported files by folder', () => {
    const rows = loadedRowsOf([
      { path: 'C:\\Users\\me\\.claude\\CLAUDE.md', tokens: 261 },
      { path: 'C:\\Users\\me\\.claude\\rules\\vault\\commits.md', tokens: 381 },
      { path: 'C:\\Users\\me\\.claude\\rules\\vault\\foundations.md', tokens: 3691 },
      { path: 'C:\\me\\vault\\Rules\\user-CLAUDE.md', tokens: 9458 },
      { path: 'C:\\me\\app\\CLAUDE.md', tokens: 1200 }
    ])
    expect(rows).toEqual([
      { path: '~/.claude/CLAUDE.md', count: 1, tokens: 261 },
      { path: '~/.claude/rules/vault', count: 2, tokens: 4072 },
      { path: 'C:/me/vault/Rules/user-CLAUDE.md', count: 1, tokens: 9458 },
      { path: 'C:/me/app/CLAUDE.md', count: 1, tokens: 1200 }
    ])
  })
})
