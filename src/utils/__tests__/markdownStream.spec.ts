import { describe, expect, it } from 'vitest'
import { settledLengthOf } from '../markdownStream'

describe('settledLengthOf', () => {
  it('should settle everything up to the last blank line', () => {
    const text = 'Erster Absatz\n\nZweiter Abs'
    expect(text.slice(0, settledLengthOf(text))).toBe('Erster Absatz\n\n')
  })

  it('should settle nothing while the reply has no blank line yet', () => {
    expect(settledLengthOf('Nur eine Zeile')).toBe(0)
  })

  it('should not settle at a blank line inside an open code block', () => {
    const text = 'Davor\n\n```ts\nconst a = 1\n\nconst b = 2'
    expect(text.slice(0, settledLengthOf(text))).toBe('Davor\n\n')
  })

  it('should settle after a code block once it is closed', () => {
    const text = '```ts\nconst a = 1\n\n```\n\nDanach'
    expect(text.slice(0, settledLengthOf(text))).toBe('```ts\nconst a = 1\n\n```\n\n')
  })

  it('should not close a backtick fence with a tilde fence', () => {
    const text = '```\n~~~\n\nnoch Code'
    expect(settledLengthOf(text)).toBe(0)
  })

  it('should not settle a trailing blank line without its line break', () => {
    expect(settledLengthOf('Absatz\n')).toBe(0)
  })
})
