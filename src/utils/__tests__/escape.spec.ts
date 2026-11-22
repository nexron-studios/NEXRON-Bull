import { describe, expect, it } from 'vitest'
import { isDoubleEscape, isFreeEscape, shouldStopOnEscape, type EscapeEvent } from '../escape'

const escapeOn = (target: EventTarget | null, fields: Partial<EscapeEvent> = {}): EscapeEvent => ({
  key: 'Escape',
  defaultPrevented: false,
  isComposing: false,
  target,
  ...fields
})

describe('shouldStopOnEscape', () => {
  it('should stop a working turn when Esc is pressed outside any field', () => {
    expect(shouldStopOnEscape(escapeOn(document.body), 'working')).toBe(true)
  })

  it('should leave Esc to the composer while typing', () => {
    const textarea = document.createElement('textarea')
    expect(shouldStopOnEscape(escapeOn(textarea), 'working')).toBe(false)
  })

  it('should leave Esc to an open dialog', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const button = dialog.appendChild(document.createElement('button'))
    expect(shouldStopOnEscape(escapeOn(button), 'working')).toBe(false)
  })

  it('should not stop while Claude waits for an answer', () => {
    expect(shouldStopOnEscape(escapeOn(document.body), 'asking')).toBe(false)
  })

  it('should ignore Esc that something else already handled', () => {
    expect(shouldStopOnEscape(escapeOn(document.body, { defaultPrevented: true }), 'working')).toBe(
      false
    )
  })
})

describe('isFreeEscape', () => {
  it('should count Esc from the composer when nothing is open', () => {
    const textarea = document.createElement('textarea')
    expect(isFreeEscape(escapeOn(textarea), false)).toBe(true)
  })

  it('should leave Esc to an open popup or a handler that took it', () => {
    expect(isFreeEscape(escapeOn(document.body), true)).toBe(false)
    expect(isFreeEscape(escapeOn(document.body, { defaultPrevented: true }), false)).toBe(false)
  })

  it('should ignore other keys', () => {
    expect(isFreeEscape(escapeOn(document.body, { key: 'Enter' }), false)).toBe(false)
  })

  it('should not count a held Esc as a second press', () => {
    expect(isFreeEscape({ ...escapeOn(document.body), repeat: true }, false)).toBe(false)
  })
})

describe('isDoubleEscape', () => {
  it('should take a second press within half a second as Esc Esc', () => {
    expect(isDoubleEscape(1_000, 1_400)).toBe(true)
  })

  it('should start over after a pause or without a first press', () => {
    expect(isDoubleEscape(1_000, 1_600)).toBe(false)
    expect(isDoubleEscape(null, 1_000)).toBe(false)
  })
})
