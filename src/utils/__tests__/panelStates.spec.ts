import { describe, expect, it } from 'vitest'
import {
  activityAsideOf,
  activityViewOf,
  connectorsInOrderOf,
  connectorsViewOf
} from '../panelStates'
import type { ToolRun, TurnSummary } from '../tabActivity'

const run: ToolRun = {
  id: 't1',
  name: 'Read',
  target: 'a.ts',
  status: 'done',
  startedAt: null,
  finishedAt: null
}
const answered: TurnSummary = { tools: 0, calls: 0, subagents: 0, durationMs: 3_000, endedAt: 0 }
const worked: TurnSummary = { tools: 2, calls: 2, subagents: 0, durationMs: 9_000, endedAt: 0 }
const planned: TurnSummary = { tools: 0, calls: 1, subagents: 0, durationMs: 9_000, endedAt: 0 }

describe('activityViewOf', () => {
  it('should show the approval while Claude waits on one', () => {
    const state = { kind: 'waiting', reason: 'approval', tool: 'Bash', target: 'ls' } as const
    expect(activityViewOf(state, [run])).toEqual({ kind: 'waiting' })
  })

  it('should show ghost rows while the running turn has no tool yet', () => {
    const state = { kind: 'running', current: null, phase: 'thinking' } as const
    expect(activityViewOf(state, [])).toEqual({ kind: 'thinking', isWriting: false })
  })

  it('should know Claude writes an answer before any tool', () => {
    const state = { kind: 'running', current: null, phase: 'writing' } as const
    expect(activityViewOf(state, [])).toEqual({ kind: 'thinking', isWriting: true })
  })

  it('should list the calls of a running turn', () => {
    const state = { kind: 'running', current: null, phase: 'working' } as const
    expect(activityViewOf(state, [run])).toEqual({ kind: 'live' })
  })

  it('should call a new chat fresh', () => {
    expect(activityViewOf({ kind: 'idle', summary: null }, [])).toEqual({ kind: 'fresh' })
  })

  it('should say a last turn without tools only answered', () => {
    expect(activityViewOf({ kind: 'idle', summary: answered }, [])).toEqual({
      kind: 'answered',
      summary: answered
    })
  })

  it('should sum up a last turn that only kept its plan', () => {
    expect(activityViewOf({ kind: 'idle', summary: planned }, [])).toEqual({
      kind: 'done',
      summary: planned
    })
  })

  it('should sum up a last turn with tools', () => {
    expect(activityViewOf({ kind: 'idle', summary: worked }, [run, run])).toEqual({
      kind: 'done',
      summary: worked
    })
  })
})

describe('activityAsideOf', () => {
  it('should count the tools and mark a live turn', () => {
    expect(activityAsideOf({ kind: 'live' }, 3)).toEqual({ toolCount: 3, mark: 'live' })
  })

  it('should mark a turn that only answered as resting', () => {
    expect(activityAsideOf({ kind: 'answered', summary: answered }, 0)).toEqual({
      toolCount: 0,
      mark: 'resting'
    })
  })

  it('should hide the count while Claude waits for the user', () => {
    expect(activityAsideOf({ kind: 'waiting' }, 4)).toEqual({ toolCount: 0, mark: 'needs-you' })
  })

  it('should show nothing beside a fresh chat', () => {
    expect(activityAsideOf({ kind: 'fresh' }, 0)).toEqual({ toolCount: 0, mark: null })
  })
})

describe('connectorsViewOf', () => {
  it('should list the servers Claude reported', () => {
    expect(connectorsViewOf('ended', [{ name: 'figma', status: 'connected' }])).toBe('list')
  })

  it('should say the account has none once Claude reported an empty list', () => {
    expect(connectorsViewOf('idle', [])).toBe('none')
  })

  it('should show the skeleton while Claude starts and nothing was reported', () => {
    expect(connectorsViewOf('starting', null)).toBe('starting')
  })

  it('should show the skeleton while the first turn runs', () => {
    expect(connectorsViewOf('working', null)).toBe('starting')
  })

  it('should wait for the next message in a resting session', () => {
    expect(connectorsViewOf('ended', null)).toBe('awaiting')
  })

  it('should wait for the first message in a new chat whose Claude runs', () => {
    expect(connectorsViewOf('idle', null)).toBe('awaiting')
  })

  describe('after the setup terminal', () => {
    it('should offer to look again once a check found nothing', () => {
      expect(connectorsViewOf('idle', [], 'checked')).toBe('recheck')
    })

    it('should show the skeleton while Claude reads its config again', () => {
      expect(connectorsViewOf('idle', [], 'checking')).toBe('checking')
    })

    it('should keep the skeleton while Claude restarts, through its moment as ended', () => {
      expect(connectorsViewOf('ended', [], 'restarting')).toBe('checking')
    })

    it('should wait for the running turn before looking', () => {
      expect(connectorsViewOf('working', [], 'due')).toBe('after_turn')
      expect(connectorsViewOf('asking', [], 'checked')).toBe('after_turn')
    })

    it('should wait for the next message when Claude is not running', () => {
      expect(connectorsViewOf('ended', [], 'due')).toBe('awaiting')
    })

    it('should offer the restart a Claude that cannot reload needs', () => {
      expect(connectorsViewOf('idle', [], 'restart')).toBe('restart')
      expect(connectorsViewOf('working', [], 'restart')).toBe('restart')
    })

    it('should list the servers as soon as there are any', () => {
      expect(connectorsViewOf('idle', [{ name: 'probe', status: 'pending' }], 'checking')).toBe(
        'list'
      )
    })
  })
})

describe('connectorsInOrderOf', () => {
  const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true })

  it('should put a login first, then errors, pending and unknown, the connected ones last', () => {
    const connectors = [
      { name: 'claude.ai Linear', status: 'connected' },
      { name: 'plugin:design:figma', status: 'unknown' },
      { name: 'plugin:desktop-commander', status: 'failed' },
      { name: 'playwright', status: 'pending' },
      { name: 'plugin:engineering:slack', status: 'needs-auth' }
    ] as const
    expect(
      connectorsInOrderOf([...connectors], collator).map((connector) => connector.name)
    ).toEqual([
      'plugin:engineering:slack',
      'plugin:desktop-commander',
      'playwright',
      'plugin:design:figma',
      'claude.ai Linear'
    ])
  })

  it('should sort by name within a state, ignoring case and reading numbers as numbers', () => {
    const connectors = [
      { name: 'server10', status: 'connected' },
      { name: 'Notion', status: 'connected' },
      { name: 'server2', status: 'connected' },
      { name: 'linear', status: 'connected' }
    ] as const
    expect(
      connectorsInOrderOf([...connectors], collator).map((connector) => connector.name)
    ).toEqual(['linear', 'Notion', 'server2', 'server10'])
  })

  it('should leave the reported list in its order', () => {
    const connectors = [
      { name: 'b', status: 'connected' as const },
      { name: 'a', status: 'needs-auth' as const }
    ]
    connectorsInOrderOf(connectors, collator)
    expect(connectors.map((connector) => connector.name)).toEqual(['b', 'a'])
  })
})
