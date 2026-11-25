import { describe, expect, it } from 'vitest'
import { summarizeToolInput } from '../toolSummary'

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

  it('should name the skill rather than its arguments', () => {
    expect(summarizeToolInput({ skill: 'code-review', args: 'low origin/main...HEAD' })).toBe(
      'code-review'
    )
  })

  it('should return an empty line when no known field is present', () => {
    expect(summarizeToolInput({ todos: [] })).toBe('')
  })
})
