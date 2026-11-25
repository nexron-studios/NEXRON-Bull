import { describe, expect, it } from 'vitest'
import type { TabInfoProps } from '@/types/agentd.type'
import { adoptedTabsOf } from '../adoptedTabs'

const info = (fields: Partial<TabInfoProps> = {}): TabInfoProps => ({
  tab: 't1',
  session_id: 's1',
  title: 'Fix the cart',
  cwd: 'C:\\work\\shop',
  profile: 'C:\\Users\\me\\.claude-work',
  account: 'work',
  model: 'haiku',
  permission_mode: 'default',
  effort: null,
  is_fresh: false,
  ...fields
})

describe('adoptedTabsOf', () => {
  it('should open a running tab the app does not know, on the machine it runs on', () => {
    expect(adoptedTabsOf([info()], new Set(), 'server')).toEqual([
      {
        id: 't1',
        title: 'Fix the cart',
        profile: 'C:\\Users\\me\\.claude-work',
        account: 'work',
        cwd: 'C:\\work\\shop',
        machine: 'server',
        sessionId: 's1',
        model: 'haiku',
        permissionMode: 'default',
        effort: null,
        isFresh: false
      }
    ])
  })

  it('should leave the title empty until Claude wrote the transcript', () => {
    const [tab] = adoptedTabsOf([info({ title: null, is_fresh: true })], new Set(), null)
    expect([tab.title, tab.isFresh]).toEqual(['', true])
  })

  it('should leave out the tabs the app has already', () => {
    const tabs = adoptedTabsOf([info(), info({ tab: 't2' })], new Set(['t1']), null)
    expect(tabs.map((tab) => tab.id)).toEqual(['t2'])
  })

  it('should drop a mode it does not know and keep a missing account empty', () => {
    const [tab] = adoptedTabsOf([info({ permission_mode: 'yolo', account: null })], new Set(), null)
    expect([tab.permissionMode, tab.account]).toEqual([null, ''])
  })
})
