import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { newTab } from '@/utils/chatTab'
import { useChatStore } from '../chat'
import { useSessionActionsStore } from '../sessionActions'
import { useWorktreeActionsStore } from '../worktreeActions'

const { toast, ask, send } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn() }),
  ask: vi.fn(),
  send: vi.fn(() => Promise.resolve())
}))

vi.mock('vue-sonner', () => ({ toast }))
vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: { ask, send, onEvent: () => () => {}, onReady: () => () => {}, waitFor: vi.fn() }
}))

/** The chat works on a subfolder; removing takes the whole worktree. */
const ROOT_OF_SUBFOLDER = 'C:\\dev\\worktrees\\app-week-view'
const WORKTREE = `${ROOT_OF_SUBFOLDER}\\src`

const worktreeTab = () => ({
  ...newTab({
    id: 't1',
    title: 'Wochenansicht',
    profile: null,
    account: 'office',
    cwd: WORKTREE,
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  status: 'ended' as const
})

describe('useWorktreeActionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    i18n.global.locale.value = 'de'
    ask.mockReset()
    toast.success.mockClear()
    toast.error.mockClear()
  })

  it('should merge the chat folder into preview and say how many commits went in', async () => {
    ask.mockResolvedValue({
      type: 'preview_merged',
      id: 1,
      branch: 'feat/week-view',
      outcome: { kind: 'merged', commits: 2 },
      created_preview: false,
      has_uncommitted: true
    })

    await useWorktreeActionsStore().mergeIntoPreview(worktreeTab())

    expect(ask).toHaveBeenCalledWith({ op: 'merge_into_preview', worktree: WORKTREE }, null)
    expect(toast.success).toHaveBeenCalledWith('feat/week-view ist in preview: 2 Commits', {
      description:
        'Im Worktree liegen noch nicht committete Änderungen. Gemergt werden nur Commits.',
      duration: 10_000
    })
  })

  it('should say in German why agentd made no merge', async () => {
    ask.mockResolvedValue({
      type: 'worktree_refused',
      id: 1,
      tab: null,
      kind: 'not_a_worktree',
      message: 'C:\dev\app is the main checkout, not a worktree'
    })

    await useWorktreeActionsStore().mergeIntoPreview(worktreeTab())

    expect(toast.error).toHaveBeenCalledWith('Das ist der Hauptordner, kein Worktree.', {
      description: undefined,
      duration: 10_000
    })
  })

  it('should close the tab once its worktree is gone after the confirmation', async () => {
    ask.mockResolvedValue({
      type: 'worktree_removed',
      id: 1,
      outcome: { kind: 'removed', branch: 'feat/week-view' }
    })
    const chat = useChatStore()
    chat.tabs = [worktreeTab()]
    const actions = useSessionActionsStore()

    actions.requestRemoveWorktree(chat.tabs[0], ROOT_OF_SUBFOLDER)
    await actions.confirm()

    expect(ask).toHaveBeenCalledWith({ op: 'remove_worktree', worktree: ROOT_OF_SUBFOLDER }, null)
    expect(chat.tabs).toEqual([])
    expect(toast.success).toHaveBeenCalledWith(
      'Worktree entfernt, Branch feat/week-view gelöscht.',
      { description: undefined, duration: 10_000 }
    )
  })

  it('should keep the tab when agentd refuses because of uncommitted work', async () => {
    ask.mockResolvedValue({
      type: 'worktree_removed',
      id: 1,
      outcome: { kind: 'uncommitted', files: ['draft.txt'] }
    })
    const chat = useChatStore()
    chat.tabs = [worktreeTab()]
    const actions = useSessionActionsStore()

    actions.requestRemoveWorktree(chat.tabs[0], WORKTREE)
    await actions.confirm()

    expect(chat.tabs.map((tab) => tab.id)).toEqual(['t1'])
    expect(toast.error).toHaveBeenCalledWith(
      'Nicht entfernt: Im Worktree gibt es nicht committete Änderungen.',
      { description: 'Betroffen: draft.txt.', duration: 10_000 }
    )
  })
})
