import { describe, expect, it } from 'vitest'
import { diffOf } from '../toolInput'

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
