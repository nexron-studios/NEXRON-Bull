import { describe, expect, it } from 'vitest'
import { fileNameOf, filesOfRewind, prefillOfRewind, rewindStepsOf, scopesFor } from '../rewind'

describe('rewindStepsOf', () => {
  it('should restore files and chat for both, one of them otherwise', () => {
    expect(rewindStepsOf('both')).toEqual({ files: true, conversation: true })
    expect(rewindStepsOf('conversation')).toEqual({ files: false, conversation: true })
    expect(rewindStepsOf('code')).toEqual({ files: true, conversation: false })
  })
})

describe('scopesFor', () => {
  it('should offer only the chat without a checkpoint', () => {
    expect(scopesFor(false)).toEqual(['conversation'])
    expect(scopesFor(true)).toEqual(['both', 'conversation', 'code'])
  })
})

describe('filesOfRewind', () => {
  it('should list the files a dry run would restore', () => {
    const response = { canRewind: true, filesChanged: ['C:\\w\\a.txt'], insertions: 1 }
    expect(filesOfRewind(response)).toEqual({ isDone: true, value: ['C:\\w\\a.txt'] })
  })

  it('should accept a real rewind, which names no files', () => {
    expect(filesOfRewind({ canRewind: true, skippedLinks: 0 })).toEqual({ isDone: true, value: [] })
  })

  it('should carry the reason Claude Code gives when it cannot rewind', () => {
    expect(filesOfRewind({ canRewind: false, error: 'No checkpoint' })).toEqual({
      isDone: false,
      reason: 'No checkpoint'
    })
  })
})

describe('prefillOfRewind', () => {
  it('should hand back the prompt that was taken back', () => {
    const response = { rewound: true, prefillText: 'Overwrite a.txt', targetMessageUuid: 'u2' }
    expect(prefillOfRewind(response)).toEqual({ isDone: true, value: 'Overwrite a.txt' })
  })

  it('should drop the line break a piped prompt ends with, but keep the inner ones', () => {
    // `echo say ok | claude -p` stores the prompt as "say ok\n"; Claude hands it back unchanged.
    expect(prefillOfRewind({ rewound: true, prefillText: 'say ok\n' })).toEqual({
      isDone: true,
      value: 'say ok'
    })
    expect(prefillOfRewind({ rewound: true, prefillText: 'first\n\nsecond\r\n\r\n' })).toEqual({
      isDone: true,
      value: 'first\n\nsecond'
    })
  })

  it('should carry the reason when Claude refused', () => {
    const response = { rewound: false, error: 'target not found', reason: 'target_not_found' }
    expect(prefillOfRewind(response)).toEqual({ isDone: false, reason: 'target not found' })
  })
})

describe('fileNameOf', () => {
  it('should keep only the name of a Windows or POSIX path', () => {
    expect(fileNameOf('C:\\work\\src\\tokens.css')).toBe('tokens.css')
    expect(fileNameOf('/work/App.vue')).toBe('App.vue')
  })
})
