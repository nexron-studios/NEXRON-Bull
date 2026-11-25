import { describe, expect, it } from 'vitest'
import { offeredSettingsSectionsOf, settingsSectionOf, shownSettingsSectionOf } from '../settings'
import { terminalShellChoiceOf } from '../terminalPreferences'

describe('settingsSectionOf', () => {
  it('should read a known section from the route', () => {
    expect(settingsSectionOf('accounts')).toBe('accounts')
    expect(settingsSectionOf('appearance')).toBe('appearance')
  })

  it('should give no section for the bare page or an unknown name', () => {
    expect(settingsSectionOf(undefined)).toBeNull()
    expect(settingsSectionOf('')).toBeNull()
    expect(settingsSectionOf('konten')).toBeNull()
    expect(settingsSectionOf(['accounts'])).toBeNull()
  })
})

describe('shownSettingsSectionOf', () => {
  it('should open the first section on the bare page when there is room next to the list', () => {
    expect(shownSettingsSectionOf(undefined, false)).toBe('accounts')
    expect(shownSettingsSectionOf('terminal', false)).toBe('terminal')
  })

  it('should show the list on the bare page of a phone', () => {
    expect(shownSettingsSectionOf(undefined, true)).toBeNull()
    expect(shownSettingsSectionOf('terminal', true)).toBe('terminal')
  })
})

describe('offeredSettingsSectionsOf', () => {
  it('should offer every section in the app window', () => {
    expect(offeredSettingsSectionsOf(true)).toEqual([
      'accounts',
      'limits',
      'machines',
      'notifications',
      'terminal',
      'worktrees',
      'appearance'
    ])
  })

  it('should leave out machines and terminal in a browser', () => {
    expect(offeredSettingsSectionsOf(false)).toEqual([
      'accounts',
      'limits',
      'notifications',
      'worktrees',
      'appearance'
    ])
  })

  it('should open the first offered section for a link to one the browser lacks', () => {
    const offered = offeredSettingsSectionsOf(false)
    expect(shownSettingsSectionOf('terminal', false, offered)).toBe('accounts')
    expect(shownSettingsSectionOf('terminal', true, offered)).toBeNull()
  })
})

describe('terminalShellChoiceOf', () => {
  it('should keep a known shell', () => {
    expect(terminalShellChoiceOf('bash')).toBe('bash')
  })

  it('should leave the choice to the terminal for nothing or anything unknown', () => {
    expect(terminalShellChoiceOf(null)).toBe('auto')
    expect(terminalShellChoiceOf('zsh')).toBe('auto')
  })
})
