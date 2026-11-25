import { describe, expect, it } from 'vitest'
import { skillArgsOf, summarizeToolInput } from '../toolSummary'

describe('summarizeToolInput', () => {
  it('should prefer the command and keep only its first line', () => {
    expect(summarizeToolInput({ description: 'List', command: 'ls -la\necho done' })).toBe('ls -la')
  })

  it('should fall back to the file path', () => {
    expect(summarizeToolInput({ file_path: 'C:\work\a.txt', content: 'x' })).toBe('C:\work\a.txt')
  })

  it('should keep only the end of a long file path', () => {
    expect(summarizeToolInput({ file_path: 'C:/Users/Home/dev/bull/src/App.vue' })).toBe(
      '…/bull/src/App.vue'
    )
  })

  it('should name the skill of a Skill call, not its args', () => {
    expect(summarizeToolInput({ args: 'high --fix', skill: 'code-review' })).toBe('code-review')
  })

  it('should return an empty line when no known field is present', () => {
    expect(summarizeToolInput({ todos: [] })).toBe('')
  })
})

describe('skillArgsOf', () => {
  it('should give the args of a Skill call as trimmed text', () => {
    expect(skillArgsOf({ args: '  high --fix\n', skill: 'code-review' })).toBe('high --fix')
  })

  it('should give an empty text when the call passes no args', () => {
    expect([skillArgsOf({ skill: 'simplify' }), skillArgsOf({ args: 3, skill: 'loop' })]).toEqual([
      '',
      ''
    ])
  })
})
