import { describe, expect, it } from 'vitest'
import type { SessionSummaryProps } from '@/types/agentd.type'
import { newTab, type ChatTabState } from '../chatTab'
import {
  canClear,
  canDelete,
  confirmationTextOf,
  hiddenKeysOf,
  isActionAvailable,
  isUnknownOpError,
  needsStop,
  targetOfDone,
  targetOfSession,
  targetOfTab
} from '../sessionActions'

const tab = (fields: Partial<ChatTabState> = {}): ChatTabState => ({
  ...newTab({
    id: 't1',
    title: 'Export',
    profile: null,
    account: 'office',
    cwd: 'C:\work',
    machine: 'nexron-server',
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  ...fields
})

const session: SessionSummaryProps = {
  session_id: 's2',
  profile: 'C:\Users\Home\.claude-office',
  account: 'office',
  cwd: 'C:\work',
  title: 'Alt',
  modified_ms: 1
}

describe('targets', () => {
  it('should keep the machine of a tab and of a session', () => {
    expect([targetOfTab(tab()).machine, targetOfSession(session, null).machine]).toEqual([
      'nexron-server',
      null
    ])
  })

  it('should find the open tab of a finished overview entry', () => {
    const open = tab({ status: 'idle' })
    const target = targetOfDone(
      {
        key: 'k',
        machine: 'nexron-server',
        title: 'Export',
        cwd: 'C:\work',
        account: 'office',
        finishedAt: 1,
        source: { kind: 'tab', tabId: 't1' }
      },
      [open]
    )
    expect(target?.tab).toBe(open)
  })

  it('should hide a session by machine, account and id', () => {
    expect(hiddenKeysOf(targetOfTab(tab()))).toEqual(['nexron-server|office:s1'])
    expect(hiddenKeysOf(targetOfTab(tab({ sessionId: null })))).toEqual([])
  })
})

describe('which actions a session offers', () => {
  it('should clear only a tab that has said something and is not starting', () => {
    expect([
      canClear(targetOfTab(tab({ status: 'idle' }))),
      canClear(targetOfTab(tab({ status: 'ended' }))),
      canClear(targetOfTab(tab({ status: 'starting' }))),
      canClear(targetOfTab(tab({ status: 'idle', isFresh: true }))),
      canClear(targetOfSession(session, null))
    ]).toEqual([true, true, false, false, false])
  })

  it('should delete only a session with a transcript', () => {
    expect([
      canDelete(targetOfSession(session, null)),
      canDelete(targetOfTab(tab())),
      canDelete(targetOfTab(tab({ isFresh: true })))
    ]).toEqual([true, true, false])
  })

  it('should stop Claude first only while it works, asks or starts', () => {
    expect(
      (['working', 'asking', 'starting', 'idle', 'ended'] as const).map((status) =>
        needsStop(targetOfTab(tab({ status })))
      )
    ).toEqual([true, true, true, false, false])
  })
})

describe('isUnknownOpError', () => {
  it('should recognise an agentd that does not know this op yet', () => {
    const old = new Error('bad request: unknown variant `delete_session`, expected one of `hello`')
    expect([
      isUnknownOpError(old, 'delete_session'),
      isUnknownOpError(old, 'clear'),
      isUnknownOpError(new Error('no running tab t1'), 'clear')
    ]).toEqual([true, false, false])
  })
})

describe('confirmationTextOf', () => {
  it('should say that an open approval is denied before clearing', () => {
    expect(confirmationTextOf('clear', targetOfTab(tab({ status: 'asking' })))).toEqual({
      title: 'session_actions.confirm.clear.title',
      body: 'session_actions.confirm.clear.body',
      confirm: 'session_actions.confirm.clear.confirm',
      notes: ['session_actions.confirm.clear.note_asking']
    })
  })

  it('should say that Claude is stopped before deleting a running tab', () => {
    expect(confirmationTextOf('delete', targetOfTab(tab({ status: 'working' }))).notes).toEqual([
      'session_actions.confirm.delete.note_running'
    ])
    expect(confirmationTextOf('delete', targetOfSession(session, null)).notes).toEqual([])
  })
})

describe('isActionAvailable', () => {
  it('should offer copying the id only once the session has one', () => {
    expect([
      isActionAvailable('copy_id', targetOfTab(tab())),
      isActionAvailable('copy_id', targetOfTab(tab({ sessionId: null })))
    ]).toEqual([true, false])
  })
})
