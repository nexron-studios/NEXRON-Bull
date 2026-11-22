import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { SentDraft } from '@/utils/pendingPrompts'

/** A message typed while Claude works; it waits above the composer until the turn ends. */
export interface HeldPrompt extends SentDraft {
  id: string
}

/**
 * Messages held back while Claude works, per tab. They can still be changed or dropped; the chat
 * store sends them once the turn ends. Not the prompts that wait for Claude to start (those are
 * already in the chat) and not the ones waiting for a limit to reset.
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

  /** All of them, oldest first, and the list is empty. */
  const takeAll = (tabId: string): HeldPrompt[] => {
    const held = heldOf(tabId)
    if (!held.length) return []
    const { [tabId]: _taken, ...rest } = byTab.value
    byTab.value = rest
    return held
  }

  return { byTab, heldOf, hold, release, takeAll }
})
