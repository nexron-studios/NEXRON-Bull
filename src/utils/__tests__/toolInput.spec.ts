import { describe, expect, it } from 'vitest'
import { diffCountsOf, diffOf, inputRowsOf, patchRowsOf } from '../toolInput'

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

describe('patchRowsOf', () => {
  it('should number removed lines in the old file and the others in the new one', () => {
    const patch = [
      {
        old_start: 41,
        new_start: 41,
        lines: [
          ' <header>',
          '-  <span>Bull</span>',
          '+  <BrandBullLogo />',
          '+  <Divider />',
          ' </header>'
        ]
      },
      { old_start: 90, new_start: 91, lines: [' a', '-b'] }
    ]
    expect(patchRowsOf(patch)).toEqual([
      { kind: 'line', sign: ' ', number: 41, text: '<header>' },
      { kind: 'line', sign: '-', number: 42, text: '  <span>Bull</span>' },
      { kind: 'line', sign: '+', number: 42, text: '  <BrandBullLogo />' },
      { kind: 'line', sign: '+', number: 43, text: '  <Divider />' },
      { kind: 'line', sign: ' ', number: 44, text: '</header>' },
      { kind: 'gap' },
      { kind: 'line', sign: ' ', number: 91, text: 'a' },
      { kind: 'line', sign: '-', number: 91, text: 'b' }
    ])
  })
})

describe('diffCountsOf', () => {
  it('should count added and removed lines, not context', () => {
    const rows = inputRowsOf([
      { sign: '-', text: 'a' },
      { sign: '+', text: 'b' },
      { sign: '+', text: 'c' }
    ])
    expect(diffCountsOf(rows)).toEqual({ added: 2, removed: 1 })
    expect(rows[0]).toEqual({ kind: 'line', sign: '-', number: null, text: 'a' })
  })
})
