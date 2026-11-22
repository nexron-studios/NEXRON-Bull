import { toValue, type MaybeRefOrGetter } from 'vue'
import { useEventListener } from '@vueuse/core'
import { choiceKeyOf } from '@/utils/approval'

/**
 * Number keys answer the card on screen, like the numbered options in Claude Code's terminal.
 * On the window, because focus is rarely on the card; a field keeps its digits.
 */
export const useChoiceKeys = (
  count: MaybeRefOrGetter<number>,
  pick: (index: number) => void
): void => {
  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    const index = choiceKeyOf(event, toValue(count))
    if (index === null) return
    event.preventDefault()
    pick(index)
  })
}
