import type { AgentdEvent, WorktreeRemoval } from '@/types/agentd.type'

/** A toast is long enough for a handful of paths; the rest is counted. */
const MAX_LISTED_FILES = 5

export const worktreeToastToneList = ['success', 'info', 'error'] as const
export type WorktreeToastTone = (typeof worktreeToastToneList)[number]

/** An i18n key with its params; `count` picks the plural form. */
export interface Phrase {
  key: string
  params: Record<string, string | number>
  count?: number
}

/** What a merge or removal tells the user: a title and the lines under it. */
export interface WorktreeToast {
  tone: WorktreeToastTone
  title: Phrase
  notes: Phrase[]
}

type PreviewMerged = Extract<AgentdEvent, { type: 'preview_merged' }>

const phrase = (key: string, params: Phrase['params'] = {}): Phrase => ({ key, params })
const counted = (key: string, count: number, params: Phrase['params'] = {}): Phrase => ({
  key,
  params: { ...params, n: count },
  count
})

const filesPhrase = (files: string[]): Phrase => {
  const listed = files.slice(0, MAX_LISTED_FILES).join(', ')
  const more = files.length - MAX_LISTED_FILES
  return more > 0
    ? counted('worktree.files_and_more', more, { files: listed })
    : phrase('worktree.files', { files: listed })
}

export const mergeToastOf = (merge: PreviewMerged): WorktreeToast => {
  const notes = [
    ...(merge.created_preview ? [phrase('worktree.preview_created')] : []),
    ...(merge.has_uncommitted ? [phrase('worktree.uncommitted_left')] : [])
  ]
  const { outcome, branch } = merge
  switch (outcome.kind) {
    case 'merged':
      return {
        tone: 'success',
        title: counted('worktree.merged', outcome.commits, { branch }),
        notes
      }
    case 'up_to_date':
      return { tone: 'info', title: phrase('worktree.nothing_to_merge', { branch }), notes }
    case 'conflict':
      return {
        tone: 'error',
        title: outcome.branches.length
          ? phrase('worktree.conflict_with', { branches: outcome.branches.join(', ') })
          : phrase('worktree.conflict'),
        notes: [filesPhrase(outcome.files), phrase('worktree.conflict_aborted'), ...notes]
      }
    case 'main_elsewhere':
      return {
        tone: 'error',
        title: phrase('worktree.main_elsewhere', { branch: outcome.branch }),
        notes: [phrase('worktree.main_elsewhere_hint'), ...notes]
      }
    case 'main_dirty':
      return { tone: 'error', title: phrase('worktree.main_dirty'), notes }
    default: {
      const unhandled: never = outcome
      throw new Error(`Unhandled merge outcome: ${JSON.stringify(unhandled)}`)
    }
  }
}

export const removalToastOf = (outcome: WorktreeRemoval): WorktreeToast => {
  switch (outcome.kind) {
    case 'removed':
      return {
        tone: 'success',
        title: phrase('worktree.removed', { branch: outcome.branch }),
        notes: []
      }
    case 'uncommitted':
      return {
        tone: 'error',
        title: phrase('worktree.refused_uncommitted'),
        notes: [filesPhrase(outcome.files)]
      }
    case 'unmerged':
      return {
        tone: 'error',
        title: counted('worktree.refused_unmerged', outcome.commits, {
          integration: outcome.integration
        }),
        notes: []
      }
    case 'in_use':
      return { tone: 'error', title: phrase('worktree.refused_in_use'), notes: [] }
    default: {
      const unhandled: never = outcome
      throw new Error(`Unhandled worktree removal: ${JSON.stringify(unhandled)}`)
    }
  }
}
