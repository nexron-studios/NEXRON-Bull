import { describe, expect, it } from 'vitest'
import { settledLengthOf } from '../markdownStream'

const settledOf = (text: string) => text.slice(0, settledLengthOf(text))

describe('settledLengthOf', () => {
  it('should settle everything before a new paragraph', () => {
    expect(settledOf('Erster Absatz\n\nZweiter Abs')).toBe('Erster Absatz\n\n')
  })

  it('should settle nothing while the reply has no blank line yet', () => {
    expect(settledLengthOf('Nur eine Zeile')).toBe(0)
  })

  it('should not settle a blank line before anything follows it', () => {
    expect(settledLengthOf('Absatz\n\n')).toBe(0)
  })

  it('should not settle at a blank line inside an open code block', () => {
    expect(settledOf('Davor\n\n```ts\nconst a = 1\n\nconst b = 2')).toBe('Davor\n\n')
  })

  it('should settle after a code block once it is closed', () => {
    expect(settledOf('```ts\nconst a = 1\n\n```\n\nDanach')).toBe('```ts\nconst a = 1\n\n```\n\n')
  })

  it('should not take a fence line with an info string as the end of a code block', () => {
    expect(settledLengthOf('```\n```ts\n\nnoch Code')).toBe(0)
  })

  it('should not close a backtick fence with a tilde fence', () => {
    expect(settledLengthOf('```\n~~~\n\nnoch Code')).toBe(0)
  })

  it('should keep the items of a loose list together', () => {
    expect(settledLengthOf('1. eins\n\n2. zwei\n\n3. drei')).toBe(0)
  })

  it('should keep an indented sub-list with its item', () => {
    expect(settledLengthOf('1. Schritt\n\n    - Unterpunkt\n    - noch einer')).toBe(0)
  })

  it('should keep an indented code block inside a list item open across a blank line', () => {
    expect(settledLengthOf('- Punkt\n\n    ```\n    a\n\n    b')).toBe(0)
  })

  it('should settle a list once a paragraph follows it', () => {
    expect(settledOf('- a\n\n- b\n\nDanach')).toBe('- a\n\n- b\n\n')
  })
})
