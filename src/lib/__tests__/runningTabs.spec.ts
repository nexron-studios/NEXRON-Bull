import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runningTabsOn } from '../runningTabs'

const { ask, isDesktop } = vi.hoisted(() => ({ ask: vi.fn(), isDesktop: { value: false } }))
vi.mock('@/lib/platform', () => ({ isDesktopApp: () => isDesktop.value }))
vi.mock('@/api/services/agentd.service', () => ({ agentdService: { ask } }))

const TAB_INFO = {
  tab: 't1',
  title: 'Moodboard',
  profile: 'C:\Users\me\.claude',
  account: 'default',
  cwd: 'C:\me',
  session_id: 's1',
  model: 'opus',
  permission_mode: 'auto',
  effort: 'high',
  is_fresh: false
}

describe('runningTabsOn in a browser', () => {
  beforeEach(() => {
    ask.mockReset()
    isDesktop.value = false
  })

  it('should fall back to running on an agentd from before tabs', async () => {
    ask.mockImplementation(async ({ op }: { op: string }) => {
      if (op === 'tabs') throw new Error('bad request: unknown variant `tabs`, expected one of …')
      return { type: 'running', id: 2, tabs: ['t1'] }
    })

    await expect(runningTabsOn('old-box', new Set())).resolves.toEqual({
      running: ['t1'],
      adopted: []
    })
  })

  it('should pass on any other failure', async () => {
    ask.mockRejectedValue(new Error('agentd crashed'))

    await expect(runningTabsOn(null, new Set())).rejects.toThrow('agentd crashed')
  })
})

describe('runningTabsOn in the app window', () => {
  beforeEach(() => {
    ask.mockReset()
    isDesktop.value = true
  })

  it('should adopt the tabs another window started on this machine', async () => {
    ask.mockResolvedValue({ type: 'tabs', id: 1, tabs: [TAB_INFO] })

    const { running, adopted } = await runningTabsOn(null, new Set())

    expect(running).toEqual(['t1'])
    expect(adopted.map((tab) => [tab.id, tab.title, tab.machine])).toEqual([
      ['t1', 'Moodboard', null]
    ])
  })

  it('should only ask which run on another machine', async () => {
    ask.mockResolvedValue({ type: 'running', id: 3, tabs: ['t1'] })

    await expect(runningTabsOn('nexron-server', new Set())).resolves.toEqual({
      running: ['t1'],
      adopted: []
    })
    expect(ask).toHaveBeenCalledWith({ op: 'running' }, 'nexron-server')
  })
})
