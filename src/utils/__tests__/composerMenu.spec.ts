import Fuse from 'fuse.js'
import { describe, expect, it } from 'vitest'
import {
  COMMAND_FUSE_OPTIONS,
  MENTION_FUSE_OPTIONS,
  commandSectionsOf,
  mentionRowsOf,
  mentionSearchableOf,
  topMentionsOf
} from '../composerMenu'
import { mentionEntriesOf } from '../fileMentions'
import type { MenuCommand } from '../slashCommands'

const command = (name: string, description: string, group: MenuCommand['group']): MenuCommand => ({
  name,
  description,
  argumentHint: '',
  group,
  source: group === 'custom' ? 'user' : null
})

const COMMANDS = [
  command('compact', 'Verlauf zusammenfassen, optional mit Schwerpunkt', 'bull'),
  command('clear', 'Neu anfangen, der Tab bleibt offen', 'bull'),
  command('review', 'Review a pull request', 'claude'),
  command('init', 'Initialize a new CLAUDE.md file with codebase documentation', 'claude'),
  command('code-review', 'Review the current diff for correctness bugs', 'custom'),
  command('commit', 'Commit staged changes', 'custom')
]

const search = (query: string) =>
  commandSectionsOf(new Fuse(COMMANDS, COMMAND_FUSE_OPTIONS).search(query))

const namesOf = (sections: ReturnType<typeof search>) =>
  sections.flatMap((section) => section.rows.map((row) => row.command.name))

describe('commandSectionsOf', () => {
  it('should find a command by a typo in its name', () => {
    expect(namesOf(search('revw'))).toEqual(['review', 'code-review'])
  })

  it('should find a command by what its description says', () => {
    expect(namesOf(search('zusammen'))).toEqual(['compact'])
  })

  it('should keep the groups in menu order and drop empty ones', () => {
    expect(search('review').map((section) => section.group)).toEqual(['claude', 'custom'])
  })

  it('should set the matched characters of the name apart', () => {
    const [first] = search('init')[0]?.rows ?? []
    expect(first?.name).toEqual([{ text: 'init', isHit: true }])
  })

  it('should list every command without highlight for an empty query', () => {
    const all = commandSectionsOf(COMMANDS.map((item, refIndex) => ({ item, refIndex })))
    expect(all.map((section) => section.rows.length)).toEqual([2, 2, 2])
    expect(all[0]?.rows[0]?.name).toEqual([{ text: 'compact', isHit: false }])
  })
})

const ENTRIES = mentionEntriesOf([
  'README.md',
  'src/components/chat/ChatComposer.vue',
  'src/components/chat/ChatPane.vue',
  'src/stores/chat.ts'
])

describe('mentionRowsOf', () => {
  it('should rank the file whose name matches first and mark the hit in the path', () => {
    const fuse = new Fuse(mentionSearchableOf(ENTRIES), MENTION_FUSE_OPTIONS)
    const [first] = mentionRowsOf(fuse.search('ChatComp'))
    expect(first?.key).toBe('src/components/chat/ChatComposer.vue')
    expect(first?.path).toEqual([
      { text: 'src/components/chat/', isHit: false },
      { text: 'ChatComp', isHit: true },
      { text: 'oser.vue', isHit: false }
    ])
  })
})

describe('topMentionsOf', () => {
  it('should start with the top of the folder, folders first', () => {
    expect(topMentionsOf(ENTRIES, 3).map((row) => row.key)).toEqual([
      'src/',
      'README.md',
      'src/components/'
    ])
  })
})
