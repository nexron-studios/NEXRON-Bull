import Fuse, { type FuseResult } from 'fuse.js'
import { describe, expect, it } from 'vitest'
import type { StreamItem } from '../chatStream'
import {
  hitsOf,
  scrollTargetOf,
  searchEntriesOf,
  snippetOf,
  steppedIndexOf,
  type SearchEntry
} from '../chatSearch'

const stream: StreamItem[] = [
  {
    kind: 'message',
    key: 'u1',
    message: {
      uuid: 'u1',
      role: 'user',
      at: '2026-11-21T12:00:00Z',
      blocks: [{ type: 'text', text: 'Push and ask which Icon variant I want.' }]
    }
  },
  { kind: 'reasoning', key: 'r1', reasoning: { text: 'thinking about icons', seconds: 2 } },
  {
    kind: 'tool',
    key: 't1',
    isCurrent: false,
    block: { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm run icons' } }
  },
  {
    kind: 'message',
    key: 'a1',
    message: {
      uuid: 'a1',
      role: 'assistant',
      at: null,
      blocks: [{ type: 'text', text: ' Done. ' }]
    }
  }
]

const entry = (key: string, order: number, text: string): SearchEntry => ({
  key,
  order,
  text,
  source: { kind: 'claude' },
  at: null
})

describe('searchEntriesOf', () => {
  it('should list what was said and the line of each tool call, without thinking', () => {
    expect(searchEntriesOf(stream)).toEqual([
      {
        key: 'u1',
        order: 0,
        text: 'Push and ask which Icon variant I want.',
        source: { kind: 'user' },
        at: '2026-11-21T12:00:00Z'
      },
      {
        key: 't1',
        order: 2,
        text: 'npm run icons',
        source: { kind: 'tool', name: 'Bash' },
        at: null
      },
      { key: 'a1', order: 3, text: 'Done.', source: { kind: 'claude' }, at: null }
    ])
  })
})

describe('hitsOf', () => {
  it('should keep chat order and take the longest matched stretch', () => {
    const results: FuseResult<SearchEntry>[] = [
      {
        item: entry('b', 5, 'an icon here'),
        refIndex: 1,
        matches: [
          {
            indices: [
              [0, 0],
              [3, 6]
            ]
          }
        ]
      },
      { item: entry('a', 1, 'Icon first'), refIndex: 0, matches: [{ indices: [[0, 3]] }] }
    ]
    expect(hitsOf(results).map(({ key, start, end }) => [key, start, end])).toEqual([
      ['a', 0, 4],
      ['b', 3, 7]
    ])
  })

  it('should drop markdown and sentence marks from the edges of the word', () => {
    const results: FuseResult<SearchEntry>[] = [
      {
        item: entry('a', 0, 'Take the _Icon_. Done'),
        refIndex: 0,
        matches: [{ indices: [[10, 13]] }]
      },
      { item: entry('b', 1, 'see icons.md.'), refIndex: 1, matches: [{ indices: [[4, 7]] }] }
    ]
    expect(hitsOf(results).map((hit) => hit.text.slice(hit.start, hit.end))).toEqual([
      'Icon',
      'icons.md'
    ])
  })

  it('should find Icon for the typo ikon with the search options of the chat', () => {
    const fuse = new Fuse(searchEntriesOf(stream), {
      keys: ['text'],
      threshold: 0.35,
      ignoreLocation: true,
      includeMatches: true,
      minMatchCharLength: 2
    })
    const hits = hitsOf(fuse.search('ikon'))
    expect(hits.map((hit) => hit.text.slice(hit.start, hit.end))).toEqual(['Icon', 'icons'])
  })
})

describe('snippetOf', () => {
  it('should keep a little before the match and mark where it was cut', () => {
    const text = `${'x'.repeat(40)} the\nIcon variant`
    const hit = { ...entry('a', 0, text), start: 45, end: 49 }
    expect(snippetOf(hit)).toEqual({
      before: `…${'x'.repeat(27)} the `,
      term: 'Icon',
      after: ' variant'
    })
  })
})

describe('steppedIndexOf', () => {
  it('should wrap around at both ends', () => {
    expect([steppedIndexOf(4, 1, 5), steppedIndexOf(0, -1, 5), steppedIndexOf(2, 0, 0)]).toEqual([
      0, 4, 0
    ])
  })
})

describe('scrollTargetOf', () => {
  it('should put the hit into the upper third and stay inside the list', () => {
    expect([
      scrollTargetOf(900, 600, 2000),
      scrollTargetOf(100, 600, 2000),
      scrollTargetOf(2500, 600, 2000)
    ]).toEqual([700, 0, 2000])
  })
})
