import { defineComponent, ref } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newTab, type ChatTabState, type TabStatus } from '@/utils/chatTab'
import { appliedSettingsKey } from '@/utils/sessionSettings'
import { useAppliedSettings } from '../useAppliedSettings'

const { askClaude } = vi.hoisted(() => ({ askClaude: vi.fn() }))

vi.mock('@/stores/chat', () => ({ useChatStore: () => ({ askClaude }) }))

const SONNET_DEFAULT = { applied: { model: 'claude-sonnet-5-5', effort: 'medium' } }
const RAISED = { applied: { model: 'claude-sonnet-5-5', effort: 'xhigh' } }

const tabWith = (status: TabStatus): ChatTabState => ({
  ...newTab({
    id: 't1',
    title: '',
    profile: null,
    account: 'work',
    cwd: String.raw`C:\work`,
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  status
})

const watchApplied = (tab: ChatTabState) => {
  const current = ref(tab)
  const queryClient = new QueryClient()
  let applied: ReturnType<typeof useAppliedSettings> | undefined
  const host = defineComponent({
    setup: () => {
      applied = useAppliedSettings(current)
      return () => null
    }
  })
  const wrapper = mount(host, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } })
  if (!applied) throw new Error('no applied settings')
  return { current, applied, queryClient, wrapper }
}

describe('useAppliedSettings', () => {
  beforeEach(() => {
    askClaude.mockReset().mockResolvedValue(SONNET_DEFAULT)
  })

  it('should ask the running Claude which effort it applies', async () => {
    const { applied, wrapper } = watchApplied(tabWith('working'))
    await flushPromises()
    expect(askClaude).toHaveBeenCalledWith('t1', { subtype: 'get_settings' })
    expect(applied.value).toEqual({ effort: 'medium' })
    wrapper.unmount()
  })

  it('should not start Claude for it in an ended chat', async () => {
    const { applied, wrapper } = watchApplied(tabWith('ended'))
    await flushPromises()
    expect(askClaude).not.toHaveBeenCalled()
    expect(applied.value).toBe(null)
    wrapper.unmount()
  })

  it('should forget the answer once Claude stopped and ask again at the next start', async () => {
    const { current, applied, wrapper } = watchApplied(tabWith('idle'))
    await flushPromises()
    current.value = { ...current.value, status: 'ended' }
    await flushPromises()
    expect(applied.value).toBe(null)
    askClaude.mockResolvedValue(RAISED)
    current.value = { ...current.value, status: 'idle' }
    await flushPromises()
    expect(askClaude).toHaveBeenCalledTimes(2)
    expect(applied.value).toEqual({ effort: 'xhigh' })
    wrapper.unmount()
  })

  it('should ask again once Claude took a change', async () => {
    const { applied, queryClient, wrapper } = watchApplied(tabWith('idle'))
    await flushPromises()
    askClaude.mockResolvedValue(RAISED)
    await queryClient.invalidateQueries({ queryKey: appliedSettingsKey(null, 't1') })
    await flushPromises()
    expect(applied.value).toEqual({ effort: 'xhigh' })
    wrapper.unmount()
  })

  it('should ask again after a turn, for an effort typed with /effort', async () => {
    const { current, applied, wrapper } = watchApplied(tabWith('idle'))
    await flushPromises()
    askClaude.mockResolvedValue(RAISED)
    current.value = { ...current.value, finishedAt: 1_000 }
    await flushPromises()
    expect(applied.value).toEqual({ effort: 'xhigh' })
    wrapper.unmount()
  })
})
