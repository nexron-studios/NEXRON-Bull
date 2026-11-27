import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ChatBackgroundBar from '../ChatBackgroundBar.vue'
import i18n from '@/i18n'
import { useChatStore } from '@/stores/chat'
import type { Block, ChatMessage } from '@/types/agentd.type'
import { newTab } from '@/utils/chatTab'

const AT = '2026-11-25T18:00:00Z'
// The stream lists the tasks after they started.
const LISTED_AT = Date.parse(AT) + 1000

const line = (uuid: string, role: ChatMessage['role'], blocks: Block[]): ChatMessage => ({
  uuid,
  role,
  at: AT,
  blocks
})
const result = (id: string, text: string): Block => ({
  type: 'tool_result',
  tool_use_id: id,
  is_error: false,
  content: [{ type: 'text', text }]
})

// Claude's turn is over: one agent and one shell it started in the background still run.
const messages = [
  line('m1', 'assistant', [
    {
      type: 'tool_use',
      id: 'toolu_agent',
      name: 'Agent',
      input: { description: 'Review the diff', subagent_type: 'Explore', run_in_background: true }
    },
    {
      type: 'tool_use',
      id: 'toolu_shell',
      name: 'Bash',
      input: { command: 'npm run build', description: 'Build', run_in_background: true }
    }
  ]),
  line('m2', 'user', [
    result('toolu_agent', 'Async agent launched successfully.\nagentId: a1'),
    result(
      'toolu_shell',
      'Command running in background with ID: b1. Output is being written to: x'
    )
  ])
]

// The tab's insights are shared while a component uses them; unmounting lets the next test build its own.
const mounted: VueWrapper[] = []

const mountBar = (backgrounded: boolean) => {
  setActivePinia(createPinia())
  const chat = useChatStore()
  const tab = newTab({
    id: 't1',
    title: 'x',
    profile: null,
    account: 'default',
    cwd: '/x',
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  })
  chat.tabs = [
    {
      ...tab,
      status: 'idle',
      messages,
      backgroundTasks: backgrounded
        ? {
            active: [
              { id: 'a1', description: 'Review the diff', kind: 'agent' },
              { id: 'b1', description: 'Build', kind: 'shell' }
            ],
            at: LISTED_AT,
            agentsSince: LISTED_AT
          }
        : { active: [], at: LISTED_AT, agentsSince: null }
    }
  ]
  const wrapper = mount(ChatBackgroundBar, { props: { tabId: 't1' }, global: { plugins: [i18n] } })
  mounted.push(wrapper)
  return wrapper
}

describe('ChatBackgroundBar', () => {
  const locale = i18n.global.locale.value
  beforeEach(() => {
    i18n.global.locale.value = 'de'
  })
  afterEach(() => {
    i18n.global.locale.value = locale
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('should list only the shells, the panel already names the agents', () => {
    const names = mountBar(true)
      .findAll('li > .flex-1')
      .map((name) => name.text())
    expect(names).toEqual(['Build'])
  })

  it('should count agents and shells in the title', () => {
    expect(mountBar(true).find('p').text()).toContain('2 Aufgaben')
  })

  it('should say that Claude replies once the agent is done', () => {
    expect(mountBar(true).find('p').text()).toContain(
      'Claude antwortet, sobald der Subagent fertig ist'
    )
  })

  it('should show nothing once nothing runs any more', () => {
    expect(mountBar(false).find('section').exists()).toBe(false)
  })
})
