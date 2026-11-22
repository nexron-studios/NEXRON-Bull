import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { ChatMessage } from '@/types/agentd.type'
import { promptTextsOf } from '@/utils/promptHistory'

/**
 * ↑ in an empty composer brings back the prompts of this chat, newest first, like the terminal;
 * ↓ goes forward again and past the newest back to an empty field. Typing ends the browsing.
 */
export const usePromptHistory = (
  messages: MaybeRefOrGetter<ChatMessage[]>,
  draft: Ref<string>,
  setCaret: (at: number) => void
) => {
  // Where the field stands in the list while browsing; `null` while the user writes.
  const position = ref<number | null>(null)

  const prompts = computed(() => promptTextsOf(toValue(messages)))

  const show = (at: number | null) => {
    position.value = at
    draft.value = at === null ? '' : (prompts.value[at] ?? '')
    setCaret(draft.value.length)
  }

  /** Whether the key moved through the history. Only on the first or last line of the field. */
  const handleKey = (event: KeyboardEvent, field: HTMLTextAreaElement): boolean => {
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false
    const isBrowsing = position.value !== null
    if (event.key === 'ArrowUp') {
      if (!isBrowsing && draft.value) return false
      if (draft.value.slice(0, field.selectionStart).includes('\n')) return false
      const previous = (position.value ?? prompts.value.length) - 1
      if (previous < 0) return false
      show(previous)
    } else if (event.key === 'ArrowDown' && isBrowsing) {
      if (draft.value.slice(field.selectionEnd).includes('\n')) return false
      const next = (position.value ?? 0) + 1
      show(next < prompts.value.length ? next : null)
    } else {
      return false
    }
    event.preventDefault()
    return true
  }

  watch(draft, (text) => {
    if (position.value !== null && text !== prompts.value[position.value]) position.value = null
  })

  return { handleKey }
}
