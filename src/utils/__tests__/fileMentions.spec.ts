import { describe, expect, it } from 'vitest'
import { mentionEntriesOf, mentionRangesOf, mentionTextOf } from '../fileMentions'

describe('mentionEntriesOf', () => {
  it('should add every folder above the files with its file count', () => {
    expect(mentionEntriesOf(['a.ts', 'src/b.ts', 'src/lib/c.ts'])).toEqual([
      { path: 'a.ts', isFolder: false, fileCount: 0 },
      { path: 'src/b.ts', isFolder: false, fileCount: 0 },
      { path: 'src/lib/c.ts', isFolder: false, fileCount: 0 },
      { path: 'src/', isFolder: true, fileCount: 2 },
      { path: 'src/lib/', isFolder: true, fileCount: 1 }
    ])
  })
})

describe('mentionTextOf', () => {
  it('should write the path the way Claude Code reads it', () => {
    expect(mentionTextOf('src/app.ts')).toBe('@src/app.ts ')
  })
})

describe('mentionRangesOf', () => {
  it('should mark only mentions of known files', () => {
    const known = new Set(['src/app.ts'])
    expect(mentionRangesOf('fix @src/app.ts like @other', known)).toEqual([
      { start: 4, end: 15, kind: 'mention' }
    ])
  })

  it('should find nothing when nothing is mentioned', () => {
    expect(mentionRangesOf('plain', new Set())).toEqual([])
  })
})
