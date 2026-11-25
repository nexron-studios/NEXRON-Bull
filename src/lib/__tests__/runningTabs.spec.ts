import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runningTabsOn } from '../runningTabs'

const { ask } = vi.hoisted(() => ({ ask: vi.fn() }))
vi.mock('@/lib/platform', () => ({ isDesktopApp: () => false }))
vi.mock('@/api/services/agentd.service', () => ({ agentdService: { ask } }))

describe('runningTabsOn in a browser', () => {
  beforeEach(() => {
    ask.mockReset()
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
