import { describe, expect, it } from 'vitest'
import {
  dayKindOf,
  filterFinished,
  filterOptionsOf,
  parseFilter,
  parseFinishedSort,
  parseSearch,
  sectionsOf,
  sortFinished
} from '../finishedList'
import type { RankedDone } from '../overview'

const collator = new Intl.Collator('de')

const row = (key: string, fields: Partial<RankedDone> = {}): RankedDone => ({
  key,
  machine: null,
  title: key,
  cwd: 'C:\\me\\dev\\projects\\nexron-chat',
  account: 'gmail',
  finishedAt: 0,
  source: { kind: 'tab', tabId: key },
  rank: null,
  ...fields
})

const keysOf = (rows: RankedDone[]) => rows.map((entry) => entry.key)

/** A local time on 21 November 2026, or a day before it. */
const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime()

describe('parseFinishedSort', () => {
  it('should keep a known sort', () => {
    expect(parseFinishedSort('folder')).toBe('folder')
  })

  it('should fall back to newest for anything else', () => {
    expect(parseFinishedSort('size')).toBe('newest')
    expect(parseFinishedSort(undefined)).toBe('newest')
  })
})

describe('parseFilter', () => {
  it('should trim a value', () => {
    expect(parseFilter(' gmail ')).toBe('gmail')
  })

  it('should let everything through for a list, an empty or a missing value', () => {
    expect(parseFilter(['a', 'b'])).toBe('*')
    expect(parseFilter(' ')).toBe('*')
    expect(parseFilter(null)).toBe('*')
  })
})

describe('parseSearch', () => {
  it('should keep the search as typed, spaces included', () => {
    expect(parseSearch('kalender ')).toBe('kalender ')
  })

  it('should read a list or a missing value as no search', () => {
    expect(parseSearch(['a', 'b'])).toBe('')
    expect(parseSearch(undefined)).toBe('')
  })
})

describe('filterFinished', () => {
  const rows = [
    row('a', { account: 'gmail', machine: null }),
    row('b', { account: 'office', machine: null }),
    row('c', { account: 'gmail', machine: 'studio' })
  ]

  it('should keep every row without a filter', () => {
    expect(keysOf(filterFinished(rows, { account: '*', machine: '*' }))).toEqual(['a', 'b', 'c'])
  })

  it('should keep the rows of one account', () => {
    expect(keysOf(filterFinished(rows, { account: 'gmail', machine: '*' }))).toEqual(['a', 'c'])
  })

  it('should match this machine by its local value', () => {
    expect(keysOf(filterFinished(rows, { account: 'gmail', machine: '@local' }))).toEqual(['a'])
  })

  it('should keep this machine apart from a host named local', () => {
    const hosts = [row('here', { machine: null }), row('there', { machine: 'local' })]
    expect(keysOf(filterFinished(hosts, { account: '*', machine: 'local' }))).toEqual(['there'])
  })
})

describe('filterOptionsOf', () => {
  it('should list each account and machine once, in alphabetical order', () => {
    const rows = [
      row('a', { account: 'office', machine: 'studio' }),
      row('b', { account: 'gmail', machine: null }),
      row('c', { account: 'office', machine: null })
    ]
    expect(filterOptionsOf(rows, { account: '*', machine: '*' }, collator)).toEqual({
      accounts: ['gmail', 'office'],
      machines: ['@local', 'studio']
    })
  })

  it('should keep an active filter as a choice when no row has it', () => {
    const rows = [row('a', { account: 'gmail', machine: null })]
    expect(filterOptionsOf(rows, { account: 'old', machine: 'studio' }, collator)).toEqual({
      accounts: ['gmail', 'old'],
      machines: ['@local', 'studio']
    })
  })
})

describe('sortFinished', () => {
  const rows = [
    row('old', { title: 'Zebra', finishedAt: 100, cwd: 'C:\\dev\\beta' }),
    row('unseen', { title: 'Mitte', finishedAt: 250, rank: 1, cwd: 'C:\\dev\\gamma' }),
    row('new', { title: 'Apfel', finishedAt: 300, cwd: 'C:\\dev\\alpha' }),
    row('mid', { title: 'Ähre', finishedAt: 200, cwd: 'C:\\dev\\beta' })
  ]

  it('should put unseen chats first, then the newest', () => {
    expect(keysOf(sortFinished(rows, 'newest', collator))).toEqual(['unseen', 'new', 'mid', 'old'])
  })

  it('should keep an unseen chat of yesterday below the chats of today', () => {
    const days = [
      row('yesterday', { finishedAt: at(20, 23), rank: 1 }),
      row('today', { finishedAt: at(21, 8) }),
      row('today-unseen', { finishedAt: at(21, 7), rank: 2 })
    ]
    expect(keysOf(sortFinished(days, 'newest', collator))).toEqual([
      'today-unseen',
      'today',
      'yesterday'
    ])
  })

  it('should put the oldest first, unseen or not', () => {
    expect(keysOf(sortFinished(rows, 'oldest', collator))).toEqual(['old', 'mid', 'unseen', 'new'])
  })

  it('should order titles alphabetically with umlauts in place', () => {
    expect(keysOf(sortFinished(rows, 'title', collator))).toEqual(['mid', 'new', 'unseen', 'old'])
  })

  it('should order by folder name, the newer one first within a folder', () => {
    expect(keysOf(sortFinished(rows, 'folder', collator))).toEqual(['new', 'mid', 'old', 'unseen'])
  })

  it('should leave the input in its order', () => {
    sortFinished(rows, 'title', collator)
    expect(keysOf(rows)).toEqual(['old', 'unseen', 'new', 'mid'])
  })
})

describe('sectionsOf', () => {
  const rows = [
    row('morning', { finishedAt: at(21, 9) }),
    row('night', { finishedAt: at(21, 1) }),
    row('yesterday', { finishedAt: at(20, 18) })
  ]

  it('should cut a date order into one section per day, in the given order', () => {
    expect(sectionsOf(rows, 'newest').map(({ day, rows }) => [day, keysOf(rows)])).toEqual([
      [at(21, 0), ['morning', 'night']],
      [at(20, 0), ['yesterday']]
    ])
  })

  it('should keep a title order as one section without a day', () => {
    expect(sectionsOf(rows, 'title').map(({ day, rows }) => [day, keysOf(rows)])).toEqual([
      [null, ['morning', 'night', 'yesterday']]
    ])
  })

  it('should have no section for no rows', () => {
    expect(sectionsOf([], 'folder')).toEqual([])
    expect(sectionsOf([], 'newest')).toEqual([])
  })
})

describe('dayKindOf', () => {
  const now = at(21, 10)

  it('should name today and yesterday', () => {
    expect(dayKindOf(at(21, 0), now)).toBe('today')
    expect(dayKindOf(at(20, 0), now)).toBe('yesterday')
  })

  it('should tell a date of this year from an older one', () => {
    expect(dayKindOf(at(19, 0), now)).toBe('this_year')
    expect(dayKindOf(new Date(2025, 11, 31).getTime(), now)).toBe('older')
  })
})
