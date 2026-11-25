import { describe, expect, it } from 'vitest'
import { diffOf, hunksOfTool } from '../toolInput'

describe('diffOf', () => {
  it('should turn an Edit into removed and added lines', () => {
    expect(
      diffOf('Edit', { file_path: 'a.vue', old_string: 'one', new_string: 'two\nthree' })
    ).toEqual([
      { sign: '-', text: 'one' },
      { sign: '+', text: 'two' },
      { sign: '+', text: 'three' }
    ])
  })

  it('should list every edit of a MultiEdit', () => {
    const edits = [
      { old_string: 'a', new_string: 'b' },
      { old_string: 'c', new_string: 'd' }
    ]
    expect(diffOf('MultiEdit', { edits })?.map((line) => line.sign + line.text)).toEqual([
      '-a',
      '+b',
      '-c',
      '+d'
    ])
  })

  it('should show a written file as added lines', () => {
    expect(diffOf('Write', { content: 'x' })).toEqual([{ sign: '+', text: 'x' }])
  })

  it('should return null for tools that change no file', () => {
    expect(diffOf('Bash', { command: 'ls' })).toBe(null)
  })
})

describe('hunksOfTool', () => {
  it('should number a Write without patch as the whole new file', () => {
    expect(hunksOfTool('Write', { content: 'a' }, undefined)).toEqual([
      { old_start: 0, new_start: 1, lines: [{ sign: '+', text: 'a' }] }
    ])
  })

  it('should leave an Edit without patch unnumbered', () => {
    expect(hunksOfTool('Edit', { old_string: 'a', new_string: 'b' }, undefined)).toEqual([
      {
        old_start: null,
        new_start: null,
        lines: [
          { sign: '-', text: 'a' },
          { sign: '+', text: 'b' }
        ]
      }
    ])
  })

  it('should prefer the patch Claude Code sent', () => {
    const patch = [{ old_start: 3, new_start: 3, lines: ['-a', '+b'] }]

    expect(hunksOfTool('Edit', { old_string: 'a', new_string: 'b' }, patch)).toEqual([
      {
        old_start: 3,
        new_start: 3,
        lines: [
          { sign: '-', text: 'a' },
          { sign: '+', text: 'b' }
        ]
      }
    ])
  })

  it('should return null for tools that change no file', () => {
    expect(hunksOfTool('Bash', { command: 'ls' }, undefined)).toBe(null)
  })
})
