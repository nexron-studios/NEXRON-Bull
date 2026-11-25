import { describe, expect, it } from 'vitest'
import { isFullPath, mergeToastOf, refusalToastOf, removalToastOf } from '../worktree'

const merged = (outcome: Parameters<typeof mergeToastOf>[0]['outcome'], extra = {}) => ({
  type: 'preview_merged' as const,
  id: 1,
  branch: 'feat/week-view',
  outcome,
  created_preview: false,
  has_uncommitted: false,
  ...extra
})

describe('mergeToastOf', () => {
  it('should count the merged commits and say preview was created', () => {
    expect(mergeToastOf(merged({ kind: 'merged', commits: 2 }, { created_preview: true }))).toEqual(
      {
        tone: 'success',
        title: {
          key: 'worktree.merged',
          params: { branch: 'feat/week-view', n: 2 },
          count: 2
        },
        notes: [{ key: 'worktree.preview_created', params: {} }]
      }
    )
  })

  it('should name the clashing branch and files and add that uncommitted work stayed', () => {
    const outcome = {
      kind: 'conflict' as const,
      files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts'],
      branches: ['feat/month-view']
    }
    expect(mergeToastOf(merged(outcome, { has_uncommitted: true }))).toEqual({
      tone: 'error',
      title: { key: 'worktree.conflict_with', params: { branches: 'feat/month-view' } },
      notes: [
        {
          key: 'worktree.files_and_more',
          params: { files: 'a.ts, b.ts, c.ts, d.ts, e.ts', n: 2 },
          count: 2
        },
        { key: 'worktree.conflict_aborted', params: {} },
        { key: 'worktree.uncommitted_left', params: {} }
      ]
    })
  })

  it('should tell that nothing was merged while the main checkout is on another branch', () => {
    expect(mergeToastOf(merged({ kind: 'main_elsewhere', branch: 'main' }))).toEqual({
      tone: 'error',
      title: { key: 'worktree.main_elsewhere', params: { branch: 'main' } },
      notes: [{ key: 'worktree.main_elsewhere_hint', params: {} }]
    })
  })

  it('should report a branch preview already has as information', () => {
    expect(mergeToastOf(merged({ kind: 'up_to_date' })).tone).toBe('info')
  })
})

describe('removalToastOf', () => {
  it('should list the uncommitted files that kept the worktree', () => {
    expect(removalToastOf({ kind: 'uncommitted', files: ['draft.txt'] })).toEqual({
      tone: 'error',
      title: { key: 'worktree.refused_uncommitted', params: {} },
      notes: [{ key: 'worktree.files', params: { files: 'draft.txt' } }]
    })
  })

  it('should count the commits the integration branch lacks', () => {
    expect(
      removalToastOf({ kind: 'unmerged', commits: 3, integration: 'origin/main' }).title
    ).toEqual({
      key: 'worktree.refused_unmerged',
      params: { integration: 'origin/main', n: 3 },
      count: 3
    })
  })
})

describe('isFullPath', () => {
  it('should take drive, share and root paths', () => {
    expect(
      ['C:\\dev\\worktrees', 'd:/trees', '\\\\server\\trees', '/Users/me/trees'].map(isFullPath)
    ).toEqual([true, true, true, true])
  })

  it('should refuse relative and home paths', () => {
    expect(['trees', '..\\trees', '~/trees', ''].map(isFullPath)).toEqual([
      false,
      false,
      false,
      false
    ])
  })
})

describe('refusalToastOf', () => {
  it('should name the refusal by its kind and carry the message of git', () => {
    expect(refusalToastOf({ kind: 'failed', message: 'git merge failed: boom' })).toEqual({
      tone: 'error',
      title: { key: 'worktree.refused.failed', params: { message: 'git merge failed: boom' } },
      notes: []
    })
  })
})
