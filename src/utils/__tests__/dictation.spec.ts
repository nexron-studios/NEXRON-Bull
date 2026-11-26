import { describe, expect, it } from 'vitest'
import { isSpaceKey, withoutHeldSpace, withRestored, withTranscript } from '../dictation'

const key = (overrides: Partial<KeyboardEvent> = {}) => ({
  key: ' ',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides
})

describe('isSpaceKey', () => {
  it('should take a plain Space', () => {
    expect(isSpaceKey(key())).toBe(true)
  })

  it('should leave Space with a modifier to its shortcut', () => {
    expect(
      [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }].map((m) =>
        isSpaceKey(key(m))
      )
    ).toEqual([false, false, false, false])
  })

  it('should not take another key', () => {
    expect(isSpaceKey(key({ key: 'a' }))).toBe(false)
  })
})

describe('withoutHeldSpace', () => {
  it('should remove the space the held key typed', () => {
    expect(withoutHeldSpace('Ich bin  müde', 7)).toEqual({ text: 'Ich bin müde', caret: 7 })
  })

  it('should keep the text when no space is there any more', () => {
    expect(withoutHeldSpace('Hallo', 2)).toEqual({ text: 'Hallo', caret: 2 })
  })

  it('should keep the caret inside a text that got shorter', () => {
    expect(withoutHeldSpace('Hi', 9)).toEqual({ text: 'Hi', caret: 2 })
  })
})

describe('withTranscript', () => {
  it('should fill an empty field with the transcript alone', () => {
    expect(withTranscript('', 0, ' Hallo Welt ')).toEqual({ text: 'Hallo Welt', caret: 10 })
  })

  it('should put a space between the last word and the transcript', () => {
    expect(withTranscript('Hallo', 5, 'Welt')).toEqual({ text: 'Hallo Welt', caret: 10 })
  })

  it('should add no second space after a space', () => {
    expect(withTranscript('Hallo ', 6, 'Welt')).toEqual({ text: 'Hallo Welt', caret: 10 })
  })

  it('should insert mid-sentence with a space on both sides', () => {
    expect(withTranscript('Ich bin müde', 7, 'sehr')).toEqual({
      text: 'Ich bin sehr müde',
      caret: 12
    })
  })

  it('should not put a space before punctuation that follows', () => {
    expect(withTranscript('Das ist.', 7, 'gut')).toEqual({ text: 'Das ist gut.', caret: 11 })
  })

  it('should not put a space after an opening bracket', () => {
    expect(withTranscript('Notiz ()', 7, 'später')).toEqual({ text: 'Notiz (später)', caret: 13 })
  })

  it('should keep the text when nothing was recognised', () => {
    expect(withTranscript('Hallo', 5, '  ')).toEqual({ text: 'Hallo', caret: 5 })
  })
})

describe('withRestored', () => {
  it('should put the replaced selection back with the caret behind it', () => {
    expect(withRestored('Hallo ', 6, 'Welt')).toEqual({ text: 'Hallo Welt', caret: 10 })
  })

  it('should leave the text alone when nothing was selected', () => {
    expect(withRestored('Hallo', 5, '')).toEqual({ text: 'Hallo', caret: 5 })
  })
})
