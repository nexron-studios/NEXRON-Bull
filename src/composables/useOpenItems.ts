import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { openItemsOf, type OpenItemProps } from '@/utils/answerCallouts'
import { useTabInsights } from '@/composables/useTabInsights'
import type { ChatTabState } from '@/utils/chatTab'

/** Per conversation, the "Offen" points the user ticked off; survives a restart. */
const DONE_KEY = 'bull.panel.open_items_done'
/** Chats whose ticks are kept; nothing else ever removes a chat from the record. */
const MAX_TICKED_CHATS = 200

const tickOf = (item: OpenItemProps): string => `${item.messageId}:${item.text}`

/**
 * The "Offen" points of the last prompt's answer, each ticked off by hand; the next prompt
 * starts over (21.11.2026: the chat keeps them highlighted anyway). A tick belongs to its
 * answer, so the same point in a later answer starts open again. Keyed by the session, so a
 * resumed chat keeps its ticks; a chat that has none yet uses its tab.
 */
export const useOpenItems = (tab: () => ChatTabState) => {
  const done = useStorage<Record<string, string[]>>(DONE_KEY, {})

  const { promptTurn } = useTabInsights(tab().id)

  const key = computed(() => tab().sessionId ?? tab().id)
  const items = computed(() => {
    const ticked = new Set(done.value[key.value] ?? [])
    return openItemsOf(promptTurn.value.messages).map((item) => ({
      ...item,
      isDone: ticked.has(tickOf(item))
    }))
  })
  const openCount = computed(() => items.value.filter((item) => !item.isDone).length)

  // The chat just ticked moves to the end; past the limit the longest untouched ones go.
  const toggle = (item: OpenItemProps) => {
    const tick = tickOf(item)
    const { [key.value]: ticked = [], ...others } = done.value
    const next = ticked.includes(tick)
      ? ticked.filter((known) => known !== tick)
      : [...ticked, tick]
    const entries = Object.entries(next.length ? { ...others, [key.value]: next } : others)
    done.value = Object.fromEntries(entries.slice(-MAX_TICKED_CHATS))
  }

  return { items, openCount, toggle }
}
