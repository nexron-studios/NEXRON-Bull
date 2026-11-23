import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ReviewComment } from '@/utils/diffReview'

/**
 * The diff review of a chat's changed files: which tab has it open on which file, and the line
 * comments written there. Comments wait per tab until they go into the composer, so closing the
 * review or switching tabs keeps them. In memory only, like the drafts they end up in.
 */
export const useDiffReviewStore = defineStore('diffReview', () => {
  /** One review at a time */
  const openTabId = ref<string | null>(null)
  /** The file shown; `null` starts at the first changed file */
  const fileKey = ref<string | null>(null)
  const comments = ref<Record<string, ReviewComment[]>>({})

  const open = (tabId: string, key: string | null = null) => {
    fileKey.value = key
    openTabId.value = tabId
  }

  const close = () => {
    openTabId.value = null
  }

  const commentsOf = (tabId: string): ReviewComment[] => comments.value[tabId] ?? []

  const add = (tabId: string, comment: ReviewComment) => {
    comments.value = { ...comments.value, [tabId]: [...commentsOf(tabId), comment] }
  }

  const remove = (tabId: string, id: string) => {
    comments.value = {
      ...comments.value,
      [tabId]: commentsOf(tabId).filter((comment) => comment.id !== id)
    }
  }

  const clear = (tabId: string) => {
    const { [tabId]: _cleared, ...rest } = comments.value
    comments.value = rest
  }

  return { openTabId, fileKey, comments, open, close, commentsOf, add, remove, clear }
})
