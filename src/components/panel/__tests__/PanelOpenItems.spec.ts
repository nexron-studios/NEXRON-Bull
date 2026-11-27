import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PanelOpenItems from '../PanelOpenItems.vue'
import i18n from '@/i18n'
import { useChatStore } from '@/stores/chat'
import type { ChatMessage } from '@/types/agentd.type'
import { newTab, type ChatTabState } from '@/utils/chatTab'

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: {
    send: vi.fn(),
    ask: vi.fn(),
    waitFor: vi.fn(),
    onEvent: () => () => {},
    onReady: () => () => {}
  }
}))

const message = (uuid: string, role: ChatMessage['role'], blocks: ChatMessage['blocks']) => ({
  uuid,
  role,
  at: null,
  blocks
})

const PROMPT = message('p1', 'user', [{ type: 'text', text: 'Build the icons' }])
const PLAN = [
  message('a1', 'assistant', [
    { type: 'tool_use', id: 'c1', name: 'TaskCreate', input: { subject: 'Draw icons' } }
  ]),
  message('u1', 'user', [
    {
      type: 'tool_result',
      tool_use_id: 'c1',
      is_error: false,
      content: [{ type: 'text', text: 'Task #1 created successfully: Draw icons' }]
    }
  ]),
  message('a2', 'assistant', [
    { type: 'tool_use', id: 'c2', name: 'TaskUpdate', input: { taskId: '1', status: 'completed' } }
  ])
]
const answer = (text: string) => message('a3', 'assistant', [{ type: 'text', text }])

const mountWith = (patch: Partial<ChatTabState>) => {
  const tab = {
    ...newTab({
      id: 't1',
      title: 'Panel',
      profile: null,
      account: 'work',
      cwd: 'C:\work\app',
      machine: null,
      sessionId: null,
      model: null,
      permissionMode: null,
      isFresh: false
    }),
    ...patch
  }
  useChatStore().tabs.push(tab)
  return mount(PanelOpenItems, { props: { tab }, global: { plugins: [i18n] } })
}

const headingOf = (wrapper: ReturnType<typeof mountWith>) => wrapper.find('h2').text()

// The tab insights are shared per tab id until the last user unmounts.
enableAutoUnmount(afterEach)

describe('PanelOpenItems', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('should show the plan with its progress while Claude works', () => {
    const wrapper = mountWith({
      status: 'working',
      messages: [PROMPT, ...PLAN],
      turn: { startedAt: 0, afterUuid: 'p1' }
    })

    expect(headingOf(wrapper)).toBe('Plan')
    expect(wrapper.text()).toContain('1 of 1')
    expect(wrapper.text()).toContain('Draw icons')
  })

  it('should show the open points once the answer has some', () => {
    const wrapper = mountWith({
      status: 'idle',
      messages: [PROMPT, ...PLAN, answer('Done.\n\n> [!todo] Offen\n> - Check the dark theme')]
    })

    expect(headingOf(wrapper)).toBe('Open')
    expect(wrapper.text()).toContain('Check the dark theme')
  })

  it('should keep the plan while a background agent still works on it', () => {
    const wrapper = mountWith({
      status: 'idle',
      finishHold: { kind: 'agents', since: 0 },
      messages: [PROMPT, ...PLAN, answer('Waiting.\n\n> [!todo] Offen\n> - Check the dark theme')]
    })

    expect(headingOf(wrapper)).toBe('Plan')
  })

  it('should keep the finished plan when the answer left nothing open', () => {
    const wrapper = mountWith({ status: 'idle', messages: [PROMPT, ...PLAN, answer('Done.')] })

    expect(headingOf(wrapper)).toBe('Plan')
  })

  it('should show nothing for a prompt without plan and open points', () => {
    const wrapper = mountWith({ status: 'idle', messages: [PROMPT, answer('Done.')] })

    expect(wrapper.find('section').exists()).toBe(false)
  })
})
