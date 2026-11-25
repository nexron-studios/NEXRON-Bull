import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { SentDraft } from '@/utils/pendingPrompts'

/**
 * A message held back above the composer until the turn ends: typed while Claude waits for an
 * approval or an answer, or a slash command typed while it works (`isHeldWhile`).
 */
export interface HeldPrompt extends SentDraft {
  id: string
}

/**
 * Messages held back per tab (`isHeldWhile`). They can still be changed, dropped or sent into the
 * running turn at once; the chat store sends them once the turn ends. Not the prompts that wait
 * for Claude to start (those are already in the chat) and not the ones waiting for a limit to reset.
 */
export const useHeldPromptsStore = defineStore('heldPrompts', () => {
  const byTab = ref<Record<string, HeldPrompt[]>>({})

  const heldOf = (tabId: string): HeldPrompt[] => byTab.value[tabId] ?? []

  const hold = (tabId: string, draft: SentDraft) => {
    byTab.value = {
      ...byTab.value,
      [tabId]: [...heldOf(tabId), { ...draft, id: crypto.randomUUID() }]
    }
  }

  /** Takes one out, e.g. to edit it in the composer. */
  const release = (tabId: string, id: string): HeldPrompt | null => {
    const prompt = heldOf(tabId).find((held) => held.id === id) ?? null
    byTab.value = { ...byTab.value, [tabId]: heldOf(tabId).filter((held) => held.id !== id) }
    return prompt
  }

  /** The oldest `count` of them; the rest stays. */
  const take = (tabId: string, count: number): HeldPrompt[] => {
    const held = heldOf(tabId)
    if (!held.length || count <= 0) return []
    const { [tabId]: _taken, ...rest } = byTab.value
    const left = held.slice(count)
    byTab.value = left.length ? { ...rest, [tabId]: left } : rest
    return held.slice(0, count)
  }

  /** All of them, oldest first, and the list is empty. */
  const takeAll = (tabId: string): HeldPrompt[] => take(tabId, heldOf(tabId).length)

  return { byTab, heldOf, hold, release, take, takeAll }
})
