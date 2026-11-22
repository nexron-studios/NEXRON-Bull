import { describe, expect, it } from 'vitest'
import { applyEvent, newTab, type ChatTabState } from '../chatTab'
import {
  appliedSettingsOf,
  modelVersionOf,
  modelInUseOf,
  modesAfter,
  nextModeOf,
  settingsOf,
  withReportedSettings
} from '../sessionSettings'

const tab = (fields: Partial<ChatTabState> = {}): ChatTabState => ({
  ...newTab({
    id: 't1',
    title: '',
    profile: null,
    account: 'work',
    cwd: 'C:\work',
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  ...fields
})

const init = (fields: Record<string, unknown>) => ({ type: 'system', subtype: 'init', ...fields })

describe('nextModeOf', () => {
  it('should walk the modes in the order of Shift+Tab in Claude Code', () => {
    const walked = ['default', 'acceptEdits', 'plan', 'auto'] as const
    expect(walked.map((mode) => nextModeOf(mode))).toEqual([
      'acceptEdits',
      'plan',
      'auto',
      'default'
    ])
  })

  it('should skip a mode Claude refused, so plan leads back to asking', () => {
    expect(nextModeOf('plan', ['auto'])).toBe('default')
  })
})

describe('modesAfter', () => {
  it('should list the modes after one, once round', () => {
    expect(modesAfter('acceptEdits')).toEqual(['plan', 'auto', 'default'])
  })

  it('should list every offered mode after one Bull does not offer', () => {
    expect(modesAfter('bypassPermissions')).toEqual(['default', 'acceptEdits', 'plan', 'auto'])
    expect(nextModeOf('dontAsk')).toBe('default')
  })
})

describe('modelVersionOf', () => {
  it('should read major and minor from a full model name', () => {
    expect(modelVersionOf('claude-opus-5-5')).toBe('5.5')
    expect(modelVersionOf('claude-haiku-4-5-20251001')).toBe('4.5')
  })

  it('should not take the date for a minor version', () => {
    expect(modelVersionOf('claude-sonnet-4-20250514')).toBe('4')
  })

  it('should give no version for an alias', () => {
    expect(modelVersionOf('opus')).toBe(null)
  })
})

describe('settingsOf', () => {
  it('should prefer what the chat chose over the account', () => {
    const defaults = { model: 'opus', effort: 'high', permission_mode: 'auto' }
    const chosen = tab({ model: 'haiku', effort: 'low', permissionMode: 'plan' })
    expect(settingsOf(chosen, defaults)).toEqual({ model: 'haiku', effort: 'low', mode: 'plan' })
  })

  it('should name a mode the account sets that Bull does not offer', () => {
    const defaults = { model: null, effort: null, permission_mode: 'bypassPermissions' }
    expect(settingsOf(tab(), defaults).mode).toBe('bypassPermissions')
  })

  it('should fall back to the account, then to asking first', () => {
    expect(settingsOf(tab(), { model: 'opus', effort: null, permission_mode: null })).toEqual({
      model: 'opus',
      effort: null,
      mode: 'default'
    })
    expect(settingsOf(tab(), null)).toEqual({ model: null, effort: null, mode: 'default' })
  })
})

describe('settingsOf with the effort Claude reports', () => {
  const defaults = { model: null, effort: 'high', permission_mode: null }

  it('should name the effort Claude picked when nobody chose one', () => {
    expect(settingsOf(tab(), null, { effort: 'medium' }).effort).toBe('medium')
  })

  it('should take the reported effort over the account, which misses per-model settings', () => {
    expect(settingsOf(tab(), defaults, { effort: 'xhigh' }).effort).toBe('xhigh')
  })

  it('should keep what the chat chose, which Bull starts Claude with again', () => {
    expect(settingsOf(tab({ effort: 'low' }), defaults, { effort: 'max' }).effort).toBe('low')
  })

  it('should name no effort when Claude reports a model without levels', () => {
    expect(settingsOf(tab(), defaults, { effort: null }).effort).toBe(null)
  })
})

describe('settingsOf while Claude does not run', () => {
  const defaults = {
    model: null,
    effort: 'medium',
    permission_mode: null,
    model_efforts: { 'claude-opus-5-5': 'xhigh' }
  }

  it('should take the account effort of the model the chat last ran with', () => {
    expect(settingsOf(tab(), defaults, null, 'claude-opus-5-5-20261001').effort).toBe('xhigh')
    expect(settingsOf(tab(), defaults, null, 'claude-opus-5-5[1m]').effort).toBe('xhigh')
  })

  it('should fall back to the account effort for a model without its own', () => {
    expect(settingsOf(tab(), defaults, null, 'claude-sonnet-5').effort).toBe('medium')
    expect(settingsOf(tab({ model: 'sonnet' }), defaults, null, 'claude-opus-5-5').effort).toBe(
      'medium'
    )
  })

  it('should take the one entry of its family for an alias Claude has not answered yet', () => {
    expect(settingsOf(tab({ model: 'opus' }), defaults).effort).toBe('xhigh')
    const twoOpus = {
      ...defaults,
      model_efforts: { 'claude-opus-5': 'low', 'claude-opus-5-5': 'max' }
    }
    expect(settingsOf(tab({ model: 'opus' }), twoOpus).effort).toBe('medium')
  })

  it('should read an agentd that sends no per-model efforts', () => {
    const older = { model: null, effort: 'high', permission_mode: null }
    expect(settingsOf(tab(), older, null, 'claude-opus-5-5').effort).toBe('high')
  })
})

describe('modelInUseOf', () => {
  it("should name Claude's answer while it is the chosen family, else the choice", () => {
    expect(modelInUseOf('opus', 'claude-opus-5-5')).toBe('claude-opus-5-5')
    expect(modelInUseOf('sonnet', 'claude-opus-5-5')).toBe('sonnet')
    expect(modelInUseOf(null, 'claude-opus-5-5')).toBe('claude-opus-5-5')
    expect(modelInUseOf(null, null)).toBe(null)
  })
})

describe('appliedSettingsOf', () => {
  it('should read the effort from the applied settings', () => {
    const answer = { effective: {}, applied: { model: 'claude-sonnet-5-5', effort: 'medium' } }
    expect(appliedSettingsOf(answer)).toEqual({ effort: 'medium' })
  })

  it('should keep a model without effort levels apart from a missing answer', () => {
    expect(appliedSettingsOf({ applied: { model: 'claude-haiku-4-5', effort: null } })).toEqual({
      effort: null
    })
    expect(appliedSettingsOf({ applied: { model: 'claude-opus-5-5' } })).toBe(null)
  })

  it('should give nothing for an answer that is not one', () => {
    expect(appliedSettingsOf(null)).toBe(null)
    expect(appliedSettingsOf({ applied: 'high' })).toBe(null)
    expect(appliedSettingsOf({ applied: { effort: 3 } })).toBe(null)
  })
})

describe('withReportedSettings', () => {
  it('should take the mode Claude reports, e.g. after leaving plan mode', () => {
    const next = withReportedSettings(
      tab({ permissionMode: 'plan' }),
      init({ permissionMode: 'default' })
    )
    expect(next.permissionMode).toBe('default')
  })

  it('should take the mode of a status event, sent as soon as it changes', () => {
    const status = {
      type: 'system',
      subtype: 'status',
      status: null,
      permissionMode: 'acceptEdits'
    }
    expect(withReportedSettings(tab({ permissionMode: 'plan' }), status).permissionMode).toBe(
      'acceptEdits'
    )
  })

  it('should leave the model alone, also when init names another one', () => {
    expect(
      withReportedSettings(tab({ model: 'haiku' }), init({ model: 'claude-opus-5-5' })).model
    ).toBe('haiku')
  })

  it('should ignore a subagent and modes Claude Code does not know', () => {
    const before = tab({ permissionMode: 'acceptEdits' })
    const subagent = init({ permissionMode: 'plan', parent_tool_use_id: 'toolu_1' })
    expect(withReportedSettings(before, subagent)).toBe(before)
    expect(withReportedSettings(before, init({ permissionMode: 'someday' }))).toBe(before)
  })

  it('should show a mode the account set that Bull does not offer', () => {
    const next = withReportedSettings(tab(), init({ permissionMode: 'bypassPermissions' }))
    expect(next.permissionMode).toBe('bypassPermissions')
  })

  it('should apply through a claude event of the tab', () => {
    const event = { type: 'claude' as const, tab: 't1', event: init({ permissionMode: 'auto' }) }
    expect(applyEvent(tab(), event).permissionMode).toBe('auto')
  })
})
