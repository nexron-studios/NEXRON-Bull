import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { VueDraggable } from 'vue-draggable-plus'
import SessionGroupList from '../SessionGroupList.vue'
import i18n from '@/i18n'
import { newTab } from '@/utils/chatTab'
import type { SessionRow } from '@/utils/sessionList'

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: { send: vi.fn(), ask: vi.fn(), waitFor: vi.fn(), onEvent: () => () => {} }
}))

// jsdom has no Web Animations; the list's entrance asks every row for its running animations.
Element.prototype.getAnimations ??= () => []

const runningRow = (key: string): SessionRow => ({
  key,
  tab: {
    ...newTab({
      id: key,
      title: key,
      profile: null,
      account: 'work',
      cwd: 'C:\\work\\app',
      machine: null,
      sessionId: null,
      model: null,
      permissionMode: null,
      isFresh: false
    }),
    status: 'working'
  },
  title: key,
  folder: 'app',
  account: 'work',
  status: 'working',
  group: 'running',
  since: null
})

const keysFrom = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, at) => `r${from + at}`)

const mountList = (rows: SessionRow[]) =>
  mount(SessionGroupList, {
    props: {
      groups: [{ group: 'running', rows }],
      query: '',
      activeId: null,
      now: 0,
      hasRows: true,
      isPending: false,
      isError: false,
      isRanked: false,
      machine: null,
      machineLabel: 'Dieser PC'
    },
    global: {
      plugins: [i18n, createPinia()],
      stubs: { SessionRow: true, SessionGroupHeader: true, VueDraggable: true }
    }
  })

describe('SessionGroupList', () => {
  it('should keep the rows past the render batch behind the dragged ones', async () => {
    // 20 running sessions, never arranged: the first batch shows 15 of them.
    const rows = keysFrom(1, 20).map(runningRow)
    const wrapper = mountList(rows)
    const dragged = ['r2', 'r1', ...keysFrom(3, 15)].map(runningRow)

    wrapper.findComponent(VueDraggable).vm.$emit('update:modelValue', dragged)

    expect(wrapper.emitted('reorder')).toEqual([[['r2', 'r1', ...keysFrom(3, 20)]]])
  })
})
