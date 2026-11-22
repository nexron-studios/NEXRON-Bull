import { describe, expect, it } from 'vitest'
import { menuCommandsOf, parseSlashInput } from '../slashCommands'

const DESCRIPTIONS = {
  compact: 'Verlauf zusammenfassen',
  context: 'Kontext zeigen',
  model: 'Modell wählen',
  rewind: 'Zurückspulen',
  clear: 'Neu anfangen',
  export: 'Als Markdown kopieren'
}

const listed = (name: string, description = '', argument_hint = '') => ({
  name,
  description,
  argument_hint
})

describe('menuCommandsOf', () => {
  it('should list Bull commands Claude knows or the app handles, in their own order', () => {
    const claude = [listed('context', 'Show current context usage'), listed('compact', '', '<x>')]
    const menu = menuCommandsOf(claude, new Set(['clear']), DESCRIPTIONS)
    expect(menu.map((c) => [c.name, c.group, c.description, c.argumentHint])).toEqual([
      ['compact', 'bull', 'Verlauf zusammenfassen', '<x>'],
      ['context', 'bull', 'Kontext zeigen', ''],
      ['clear', 'bull', 'Neu anfangen', '']
    ])
  })

  it('should sort custom commands, skills and plugin entries after the shipped ones', () => {
    const claude = [
      listed('commit', 'Commit staged changes (user)'),
      listed('init', 'Initialize a new CLAUDE.md file'),
      listed('engineering:debug', 'Structured debugging session'),
      listed('docs', 'Living docs (claude.ai sync)')
    ]
    const menu = menuCommandsOf(claude, new Set(), DESCRIPTIONS)
    expect(menu.map((c) => [c.name, c.group, c.source, c.description])).toEqual([
      ['init', 'claude', null, 'Initialize a new CLAUDE.md file'],
      ['commit', 'custom', 'user', 'Commit staged changes'],
      ['engineering:debug', 'custom', 'engineering', 'Structured debugging session'],
      ['docs', 'custom', 'claude.ai sync', 'Living docs']
    ])
  })

  it('should leave out internal entries of server-launched sessions', () => {
    expect(menuCommandsOf([listed('__remote-workflow')], new Set(), DESCRIPTIONS)).toEqual([])
  })
})

describe('parseSlashInput', () => {
  it('should split a command from its arguments', () => {
    expect(parseSlashInput('/compact  keep the API notes ')).toEqual({
      name: 'compact',
      args: 'keep the API notes'
    })
    expect(parseSlashInput('/engineering:debug')).toEqual({ name: 'engineering:debug', args: '' })
  })

  it('should not take a path or plain text for a command', () => {
    expect(parseSlashInput('/src/app.ts')).toBeNull()
    expect(parseSlashInput('fix /compact')).toBeNull()
    expect(parseSlashInput('/')).toBeNull()
  })
})
