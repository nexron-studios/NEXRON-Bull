import { describe, expect, it } from 'vitest'
import {
  CHOICE_CARD_ATTRIBUTE,
  alwaysTargetOf,
  approvalKindOf,
  approvalSummaryOf,
  choiceKeyOf,
  planOf,
  suggestionsOf
} from '../approval'

const keyOn = (key: string, fields: Partial<Parameters<typeof choiceKeyOf>[0]> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  target: document.body,
  ...fields
})

describe('suggestionsOf', () => {
  it('should keep only object entries', () => {
    const rule = { type: 'addRules', rules: [], behavior: 'allow', destination: 'localSettings' }
    expect(suggestionsOf([rule, 'x', null, 3, []])).toEqual([rule])
  })

  it('should read anything but a list as no suggestions', () => {
    expect(suggestionsOf(undefined)).toEqual([])
  })
})

describe('alwaysTargetOf', () => {
  it('should name the command of a prefix rule without its wildcard', () => {
    const suggestions = [
      { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'git push:*' }] }
    ]
    expect(alwaysTargetOf(suggestions)).toBe('git push')
  })

  it('should name the tool of a rule without content', () => {
    expect(alwaysTargetOf([{ type: 'addRules', rules: [{ toolName: 'WebFetch' }] }])).toBe(
      'WebFetch'
    )
  })

  it('should skip suggestions that are not rules', () => {
    const suggestions = [
      { type: 'addDirectories', directories: ['C:\\tmp'] },
      { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }] }
    ]
    expect(alwaysTargetOf(suggestions)).toBe('npm test')
  })

  it('should give null when no suggestion is a rule', () => {
    expect(alwaysTargetOf([{ type: 'setMode', mode: 'acceptEdits' }])).toBeNull()
  })
})

describe('approvalSummaryOf', () => {
  it('should show a Bash command whole, with its description', () => {
    const command = 'git push -u origin feat/bull-brand && echo done'
    expect(approvalSummaryOf({ command, description: 'Pushes the branch' })).toEqual({
      line: command,
      description: 'Pushes the branch',
      hasMore: false
    })
  })

  it('should point at the details when the input holds more than the line', () => {
    expect(approvalSummaryOf({ file_path: 'src/a.ts', old_string: 'a', new_string: 'b' })).toEqual({
      line: 'src/a.ts',
      description: null,
      hasMore: true
    })
  })

  it('should put what Grep searches before where', () => {
    expect(approvalSummaryOf({ pattern: 'API_KEY', path: 'C:\me' }).line).toBe('API_KEY')
  })

  it('should give no line for an input without a known field', () => {
    expect(approvalSummaryOf({ todos: [] })).toEqual({
      line: null,
      description: null,
      hasMore: true
    })
  })
})

describe('choiceKeyOf', () => {
  it('should turn a number key into a 0-based choice', () => {
    expect(choiceKeyOf(keyOn('2'), 3)).toBe(1)
  })

  it('should ignore a number past the last choice', () => {
    expect(choiceKeyOf(keyOn('3'), 2)).toBeNull()
  })

  it('should leave digits to a text field', () => {
    const textarea = document.createElement('textarea')
    expect(choiceKeyOf(keyOn('1', { target: textarea }), 3)).toBeNull()
  })

  it('should leave digits to an open dialog', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const button = dialog.appendChild(document.createElement('button'))
    expect(choiceKeyOf(keyOn('1', { target: button }), 3)).toBeNull()
  })

  it('should answer from a button inside the card', () => {
    const card = document.createElement('section')
    card.setAttribute('role', 'alertdialog')
    card.setAttribute(CHOICE_CARD_ATTRIBUTE, '')
    const button = card.appendChild(document.createElement('button'))
    expect(choiceKeyOf(keyOn('1', { target: button }), 3)).toBe(0)
  })

  it('should leave digits to a confirm dialog over the card', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'alertdialog')
    const button = dialog.appendChild(document.createElement('button'))
    expect(choiceKeyOf(keyOn('1', { target: button }), 3)).toBeNull()
  })

  it('should answer from an option radio button of a question card', () => {
    const radio = document.createElement('input')
    radio.type = 'radio'
    expect(choiceKeyOf(keyOn('2', { target: radio }), 3)).toBe(1)
  })

  it('should ignore a number with a modifier or a held key', () => {
    expect([
      choiceKeyOf(keyOn('1', { ctrlKey: true }), 3),
      choiceKeyOf(keyOn('1', { altKey: true }), 3),
      choiceKeyOf(keyOn('1', { repeat: true }), 3)
    ]).toEqual([null, null, null])
  })

  it('should ignore keys that are not 1 to 9', () => {
    expect([choiceKeyOf(keyOn('0'), 3), choiceKeyOf(keyOn('a'), 3)]).toEqual([null, null])
  })
})

describe('planOf', () => {
  it('should give the plan of a request to leave plan mode', () => {
    expect(planOf({ toolName: 'ExitPlanMode', input: { plan: '1. Build' } })).toBe('1. Build')
  })

  it('should give null for any other tool', () => {
    expect(planOf({ toolName: 'Bash', input: { plan: 'x' } })).toBeNull()
  })
})

describe('approvalKindOf', () => {
  it('should tell question, plan and plain tool apart', () => {
    expect([
      approvalKindOf({ toolName: 'AskUserQuestion', input: {} }),
      approvalKindOf({ toolName: 'ExitPlanMode', input: { plan: '1. Build' } }),
      approvalKindOf({ toolName: 'ExitPlanMode', input: {} }),
      approvalKindOf({ toolName: 'Bash', input: { command: 'ls' } })
    ]).toEqual(['question', 'plan', 'tool', 'tool'])
  })
})
