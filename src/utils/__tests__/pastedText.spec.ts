import { describe, expect, it } from 'vitest'
import { isLargePaste, lineCountOf, withPastes } from '../pastedText'

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n')

describe('isLargePaste', () => {
  it('should turn a paste over 20 lines into a chip and keep shorter ones as text', () => {
    expect(isLargePaste(lines(21))).toBe(true)
    expect(isLargePaste(lines(20))).toBe(false)
  })
})

describe('lineCountOf', () => {
  it('should count Windows and Unix line ends alike', () => {
    expect(lineCountOf('a\r\nb\nc')).toBe(3)
  })
})

describe('withPastes', () => {
  it('should put the pastes after the typed text, in the order they came', () => {
    const pastes = [
      { id: '1', text: 'first log', lineCount: 1 },
      { id: '2', text: 'second log', lineCount: 1 }
    ]
    expect(withPastes('What is wrong?', pastes)).toBe('What is wrong?\n\nfirst log\n\nsecond log')
    expect(withPastes('', pastes.slice(0, 1))).toBe('first log')
  })
})
