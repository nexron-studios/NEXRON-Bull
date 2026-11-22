import { mount } from '@vue/test-utils'
import { computed } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ChatThinkingBar from '../ChatThinkingBar.vue'
import i18n from '@/i18n'
import { newTab, type ChatTabState } from '@/utils/chatTab'
import type { ChatMessage } from '@/types/agentd.type'

// The settings read profile defaults from agentd; the bar only needs the effort from them.
vi.mock('@/composables/useSessionSettings', () => ({
  useSessionSettings: () => ({ settings: computed(() => ({ effort: null })) })
}))

const runTests: ChatMessage = {
  uuid: 'a1',
  role: 'assistant',
  at: null,
  blocks: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test' } }]
}

const tab = (fields: Partial<ChatTabState> = {}): ChatTabState => ({
  ...newTab({
    id: 't1',
    title: '',
    profile: null,
    account: 'default',
    cwd: 'C:\\work',
    machine: null,
    sessionId: null,
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  status: 'working',
  turn: { startedAt: Date.now(), afterUuid: null },
  messages: [runTests],
  ...fields
})

const mountBar = (state: ChatTabState) =>
  mount(ChatThinkingBar, {
    props: { tab: state, results: new Map() },
    global: { plugins: [i18n] }
  })

describe('ChatThinkingBar', () => {
  it('should lead with the plain activity and trail it with an English quip while a tool runs', () => {
    i18n.global.locale.value = 'de'
    const text = mountBar(tab()).text()
    expect(text).toMatch(
      /^Claude führt npm test aus.*·(Pawing the ground|Charging|Locking horns|Bulldozing through|Rallying the market|Stampeding|Ploughing ahead)…/
    )
  })

  it('should keep the plain activity on a phone, where the label opens the sheet', () => {
    i18n.global.locale.value = 'de'
    const wrapper = mount(ChatThinkingBar, {
      props: { tab: tab(), results: new Map(), hasDetails: true },
      global: { plugins: [i18n] }
    })
    expect(wrapper.find('button').text()).toContain('Claude führt npm test aus')
  })

  it('should say Claude is getting started before its first reaction', () => {
    i18n.global.locale.value = 'de'
    const wrapper = mount(ChatThinkingBar, {
      props: { tab: tab({ messages: [] }), results: new Map(), isStarting: true },
      global: { plugins: [i18n] }
    })
    expect(wrapper.find('[aria-live="polite"]').text()).toBe('Claude legt los')
  })

  it('should leave the Esc hint out on a phone', () => {
    i18n.global.locale.value = 'de'
    const wrapper = mount(ChatThinkingBar, {
      props: { tab: tab(), results: new Map(), hasDetails: true },
      global: { plugins: [i18n] }
    })
    expect(wrapper.find('kbd').exists()).toBe(false)
  })

  it('should announce only the plain label to screen readers', () => {
    i18n.global.locale.value = 'de'
    const live = mountBar(tab()).find('[aria-live="polite"]')
    expect(live.text()).toBe('Claude führt npm test aus')
  })

  it('should show no quip while Claude waits for an approval', () => {
    i18n.global.locale.value = 'de'
    const permission = { requestId: 'r1', toolName: 'Bash', input: {}, suggestions: [] }
    const wrapper = mountBar(tab({ status: 'asking', permission }))
    expect(wrapper.text()).not.toContain('…')
    expect(wrapper.text()).toContain('Claude wartet auf dich')
  })
})
