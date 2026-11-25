import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentdRequest } from '@/types/agentd.type'
import { newTab, type TabStatus } from '@/utils/chatTab'
import { useChatStore } from '../chat'
import { useDraftStore } from '../drafts'
import { RewindRefusedError, useRewindStore } from '../rewind'

const { ask, send } = vi.hoisted(() => ({
  ask: vi.fn<(request: AgentdRequest) => Promise<unknown>>(),
  send: vi.fn(() => Promise.resolve())
}))

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: { ask, send, onEvent: () => () => {}, onReady: () => () => {}, waitFor: vi.fn() }
}))

const openTab = (status: TabStatus) => {
  const chat = useChatStore()
  const tab = newTab({
    id: 't1',
    title: 'chat',
    profile: null,
    account: 'office',
    cwd: 'C:\\work',
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  })
  chat.tabs = [{ ...tab, status }]
}

/** Answers each control request like Claude Code 2.1.327, the history with an empty page. */
const answerLikeClaude = (refuseConversation = false) =>
  ask.mockImplementation((request: AgentdRequest) => {
    if (request.op === 'history')
      return Promise.resolve({ type: 'history', messages: [], has_more: false })
    // The transcript already shows the cut: the target prompt is no rewind point any more.
    if (request.op === 'rewind_points')
      return Promise.resolve({ type: 'rewind_points', points: [] })
    if (request.op !== 'control') throw new Error(`unexpected ${request.op}`)
    const response =
      request.request.subtype === 'rewind_files'
        ? { canRewind: true, skippedLinks: 0 }
        : refuseConversation
          ? { rewound: false, error: 'target not found', reason: 'target_not_found' }
          : { rewound: true, prefillText: 'Overwrite a.txt' }
    return Promise.resolve({ type: 'control_result', tab: 't1', response })
  })

const controlRequests = () =>
  ask.mock.calls.flatMap(([request]) => (request.op === 'control' ? [request.request] : []))

describe('useRewindStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ask.mockReset()
  })

  it('should restore the files, then cut the chat at the chosen prompt', async () => {
    openTab('idle')
    answerLikeClaude()

    await useRewindStore().rewind('t1', 'u2', 'both')

    expect(controlRequests()).toEqual([
      { subtype: 'rewind_files', user_message_id: 'u2' },
      { subtype: 'rewind_conversation', target_message_uuid: 'u2' }
    ])
  })

  it('should put the prompt back in the composer before what was typed meanwhile', async () => {
    openTab('idle')
    answerLikeClaude()
    useDraftStore().draftOf('t1').text = 'half a thought'

    await useRewindStore().rewind('t1', 'u2', 'conversation')

    expect(useDraftStore().draftOf('t1').text).toBe('Overwrite a.txt\n\nhalf a thought')
  })

  it('should leave the chat alone when only the code goes back', async () => {
    openTab('idle')
    answerLikeClaude()

    await useRewindStore().rewind('t1', 'u2', 'code')

    expect(controlRequests()).toEqual([{ subtype: 'rewind_files', user_message_id: 'u2' }])
    expect(useDraftStore().draftOf('t1').text).toBe('')
  })

  it('should fail with Claude Code reason and keep the draft when it refuses', async () => {
    openTab('idle')
    answerLikeClaude(true)

    await expect(useRewindStore().rewind('t1', 'u2', 'conversation')).rejects.toThrow(
      new RewindRefusedError('target not found', false)
    )
    expect(useDraftStore().draftOf('t1').text).toBe('')
  })

  it('should say that the code went back when only the chat was refused', async () => {
    openTab('idle')
    answerLikeClaude(true)

    const failure = await useRewindStore()
      .rewind('t1', 'u2', 'both')
      .catch((error: unknown) => error)

    expect(failure instanceof RewindRefusedError && failure.isCodeBack).toBe(true)
  })

  it('should not open while Claude is working on a turn', () => {
    openTab('working')
    const store = useRewindStore()

    store.openRewind('t1')

    expect(store.openTabId).toBe(null)
  })
})
