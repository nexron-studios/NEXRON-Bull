import { describe, expect, it } from 'vitest'
import { hookBlockOf, outputTailOf } from '../toolOutput'
import type { ToolResultBlock } from '../toolPairs'

const result = (text: string, isError = true): ToolResultBlock => ({
  type: 'tool_result',
  tool_use_id: 't1',
  is_error: isError,
  content: [{ type: 'text', text }]
})

describe('outputTailOf', () => {
  it('should keep the last lines and count the ones before', () => {
    const text = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join('\n')
    expect(outputTailOf(`${text}\n`)).toEqual({
      hidden: 3,
      lines: ['line 4', 'line 5', 'line 6', 'line 7', 'line 8']
    })
  })

  it('should hide nothing in a short output', () => {
    expect(outputTailOf('ok')).toEqual({ hidden: 0, lines: ['ok'] })
  })
})

describe('hookBlockOf', () => {
  it('should read tool, command and reason of a blocked call', () => {
    const text =
      'PreToolUse:Bash hook error: [node C:/hooks/no-force.js]: git push --force is blocked here'
    expect(hookBlockOf(result(text))).toEqual({
      tool: 'Bash',
      command: 'node C:/hooks/no-force.js',
      reason: 'git push --force is blocked here'
    })
  })

  it('should keep a command that holds brackets of its own', () => {
    const text = 'PreToolUse:Edit hook error: [check [strict]]: Not on main'
    expect(hookBlockOf(result(text))).toMatchObject({
      command: 'check [strict]',
      reason: 'Not on main'
    })
  })

  it('should leave other errors and successful results alone', () => {
    expect(hookBlockOf(result('Exit code 1'))).toBeNull()
    expect(hookBlockOf(result('PreToolUse:Bash hook error: [x]: no', false))).toBeNull()
    expect(hookBlockOf(null)).toBeNull()
  })
})
