import { describe, expect, it } from 'vitest'
import { replaceTrigger, triggerAt } from '../composerTrigger'

describe('triggerAt', () => {
  it('should open the command menu while the command name is typed at the start', () => {
    expect(triggerAt('/rev', 4)).toEqual({ kind: 'slash', query: 'rev', start: 0, end: 4 })
    expect(triggerAt('/compact now', 12)).toBeNull()
    expect(triggerAt('see /compact', 12)).toBeNull()
    expect(triggerAt('/etc/hosts', 10)).toBeNull()
  })

  it('should open the file menu for an @ after a space or at the start', () => {
    expect(triggerAt('look at @chat', 13)).toEqual({
      kind: 'mention',
      query: 'chat',
      start: 8,
      end: 13
    })
    expect(triggerAt('@', 1)).toEqual({ kind: 'mention', query: '', start: 0, end: 1 })
  })

  it('should leave mail addresses and finished mentions alone', () => {
    expect(triggerAt('mail alex@example.com', 22)).toBeNull()
    expect(triggerAt('@src/app.ts and more', 20)).toBeNull()
  })
})

describe('replaceTrigger', () => {
  it('should put the pick in place of what was typed and the caret after it', () => {
    const trigger = { kind: 'mention' as const, query: 'chat', start: 4, end: 9 }
    expect(replaceTrigger('see @chat now', trigger, '@src/chat.ts ')).toEqual({
      text: 'see @src/chat.ts now',
      caret: 16
    })
  })
})
