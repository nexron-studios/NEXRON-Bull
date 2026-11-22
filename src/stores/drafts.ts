import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { PendingImage } from '@/utils/content'
import type { PastedText } from '@/utils/pastedText'

export interface DraftProps {
  text: string
  images: PendingImage[]
  /** Images still being read; they hold their slots and block sending until they land */
  readingCount: number
  /** Large pastes shown as chips; they join the text when the message goes out */
  pastes: PastedText[]
}

/**
 * The unsent message of each tab. The composer unmounts when a phone goes back to the list or a
 * tab is switched; the draft waits here. Kept in memory only: images are whole data URLs.
 */
export const useDraftStore = defineStore('drafts', () => {
  const drafts = ref<Record<string, DraftProps>>({})

  /** The draft of one tab, created empty on first use. */
  const draftOf = (tabId: string): DraftProps => {
    drafts.value[tabId] ??= { text: '', images: [], readingCount: 0, pastes: [] }
    return drafts.value[tabId]
  }

  const discard = (tabId: string) => {
    const { [tabId]: _discarded, ...rest } = drafts.value
    drafts.value = rest
  }

  return { drafts, draftOf, discard }
})
