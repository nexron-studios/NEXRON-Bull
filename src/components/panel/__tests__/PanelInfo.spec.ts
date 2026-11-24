import { shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import PanelInfo from '../PanelInfo.vue'
import i18n from '@/i18n'
import { newTab } from '@/utils/chatTab'

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: { send: vi.fn(), ask: vi.fn(), waitFor: vi.fn(), onEvent: () => () => {} }
}))

const tab = newTab({
  id: 't1',
  title: 'Panel',
  profile: null,
  account: 'work',
  cwd: 'C:\\work\\app',
  machine: null,
  sessionId: null,
  model: null,
  permissionMode: null,
  isFresh: false
})

describe('PanelInfo', () => {
  // The rows' `sr-only` labels are absolutely positioned. Their containing block must be the
  // scroller itself, or they escape its scrolling and stretch the window (24.11.2026).
  it('should make its scroll area the containing block of positioned rows', () => {
    const wrapper = shallowMount(PanelInfo, {
      props: { tab },
      global: { plugins: [createPinia(), i18n] }
    })

    const scroller = wrapper.get('aside')

    expect(scroller.classes()).toEqual(expect.arrayContaining(['relative', 'overflow-y-auto']))
  })
})
