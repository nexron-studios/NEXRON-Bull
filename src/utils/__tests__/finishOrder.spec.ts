import { describe, expect, it } from 'vitest'
import { newTab, type ChatTabState } from '../chatTab'
import {
  finishOrderOf,
  finishRanksOf,
  finishSortedOf,
  isLookingAt,
  isSameFinishTimes,
  isSameRanks,
  newlyFinishedOf,
  summaryOf,
  withSeen,
  withUnseen
} from '../finishOrder'
import type { ChatMessage } from '@/types/agentd.type'

const tab = (id: string, fields: Partial<ChatTabState> = {}): ChatTabState => ({
  ...newTab({
    id,
    title: '',
    profile: null,
    account: 'default',
    cwd: 'C:\\work',
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  ...fields
})

const answer = (uuid: string, text: string): ChatMessage => ({
  uuid,
  role: 'assistant',
  at: null,
  blocks: [{ type: 'text', text }]
})

describe('finishSortedOf', () => {
  it('should put the finished tabs first as ① ② ③ and keep the rest in their order', () => {
    const tabs = [
      tab('d'),
      tab('older', { unseenAt: 100 }),
      tab('b'),
      tab('newest', { unseenAt: 300 }),
      tab('a'),
      tab('failed', { unseenAt: 400, notice: 'Fehler' })
    ]
    expect(finishSortedOf(tabs).map((open) => open.id)).toEqual([
      'newest',
      'older',
      'd',
      'b',
      'a',
      'failed'
    ])
  })

  it('should return the same list when the order already fits', () => {
    const tabs = [tab('first', { unseenAt: 2 }), tab('second', { unseenAt: 1 }), tab('rest')]
    expect(finishSortedOf(tabs)).toBe(tabs)
  })
})

describe('finishOrderOf', () => {
  it('should put the most recently finished chat first', () => {
    const tabs = [tab('a', { unseenAt: 1000 }), tab('b', { unseenAt: 3000 }), tab('c')]
    expect(finishOrderOf(tabs)).toEqual(['b', 'a'])
  })
})

describe('finishRanksOf', () => {
  it('should number unseen chats from 1, the others moving up when one is seen', () => {
    const tabs = [tab('a', { unseenAt: 1000 }), tab('b', { unseenAt: 3000 })]
    const afterSeeing = [tabs[0], withSeen(tabs[1])]
    expect([[...finishRanksOf(tabs)], [...finishRanksOf(afterSeeing)]]).toEqual([
      [
        ['b', 1],
        ['a', 2]
      ],
      [['a', 1]]
    ])
  })

  it('should give no number to a chat that reported an error after finishing, the others moving up', () => {
    const tabs = [
      tab('a', { unseenAt: 1000 }),
      tab('b', { unseenAt: 3000, notice: 'API Error: 529 Overloaded' })
    ]
    expect([...finishRanksOf(tabs)]).toEqual([['a', 1]])
  })

  it('should keep the number of a chat restored after a restart, which starts as ended', () => {
    expect([...finishRanksOf([tab('a', { unseenAt: 1000, status: 'ended' })])]).toEqual([['a', 1]])
  })
})

describe('newlyFinishedOf', () => {
  it('should report a tab whose turn ended since the last update', () => {
    const before = [
      { id: 'a', finishedAt: null },
      { id: 'b', finishedAt: 1000 }
    ]
    const after = [
      { id: 'a', finishedAt: 2000 },
      { id: 'b', finishedAt: 1000 }
    ]
    expect(newlyFinishedOf(before, after)).toEqual([{ id: 'a', at: 2000 }])
  })

  it('should not report a tab that just opened or was cleared', () => {
    const before = [{ id: 'a', finishedAt: 1000 }]
    const after = [
      { id: 'a', finishedAt: null },
      { id: 'b', finishedAt: 2000 }
    ]
    expect(newlyFinishedOf(before, after)).toEqual([])
  })
})

describe('isSameFinishTimes', () => {
  it('should tell equal finish times from a changed one', () => {
    const times = [{ id: 'a', finishedAt: 1000 }]
    expect([
      isSameFinishTimes(times, [{ id: 'a', finishedAt: 1000 }]),
      isSameFinishTimes(times, [{ id: 'a', finishedAt: 2000 }])
    ]).toEqual([true, false])
  })
})

describe('isSameRanks', () => {
  it('should tell equal numbers from a moved or missing one', () => {
    const ranks = new Map([
      ['a', 1],
      ['b', 2]
    ])
    expect([
      isSameRanks(
        ranks,
        new Map([
          ['a', 1],
          ['b', 2]
        ])
      ),
      isSameRanks(
        ranks,
        new Map([
          ['b', 1],
          ['a', 2]
        ])
      ),
      isSameRanks(ranks, new Map([['a', 1]]))
    ]).toEqual([true, false, false])
  })
})

describe('isLookingAt', () => {
  it('should only count the chat on screen in a focused window as seen', () => {
    expect([
      isLookingAt('a', 'a', true),
      isLookingAt('a', 'a', false),
      isLookingAt('a', 'b', true),
      isLookingAt('a', null, true)
    ]).toEqual([true, false, false, false])
  })
})

describe('withUnseen', () => {
  it('should mark the turn that just ended as not seen', () => {
    expect(withUnseen(tab('a', { finishedAt: 2000 }), 2000).unseenAt).toBe(2000)
  })

  it('should leave a tab alone that started a new turn meanwhile', () => {
    const turn = { startedAt: 2500, afterUuid: null }
    expect(withUnseen(tab('a', { finishedAt: 2000, turn }), 2000).unseenAt).toBe(null)
  })

  it('should leave a tab alone whose chat was cleared meanwhile', () => {
    expect(withUnseen(tab('a', { finishedAt: null }), 2000).unseenAt).toBe(null)
  })
})

describe('summaryOf', () => {
  it('should take the first line of the last answer without markdown marks', () => {
    const messages = [
      answer('m1', 'Old answer'),
      answer('m2', '\n## **Fixed** the `header`\n\nDetails follow')
    ]
    expect(summaryOf(messages)).toBe('Fixed the header')
  })

  it('should be empty while no answer is loaded', () => {
    expect(summaryOf([])).toBe('')
  })
})
