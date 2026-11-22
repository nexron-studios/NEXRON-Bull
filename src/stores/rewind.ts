import { ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchRewindPoints } from '@/composables/useRewindPoints'
import { useChatStore } from '@/stores/chat'
import { useDraftStore } from '@/stores/drafts'
import { filesOfRewind, prefillOfRewind, rewindStepsOf, type RewindScope } from '@/utils/rewind'

/**
 * Claude refused a step, in its own words. `isCodeBack`: the files went back already and only the
 * chat stayed, so the user must not take it for "nothing happened".
 */
export class RewindRefusedError extends Error {
  readonly isCodeBack: boolean

  constructor(reason: string, isCodeBack: boolean) {
    super(reason)
    this.name = 'RewindRefusedError'
    this.isCodeBack = isCodeBack
  }
}

/**
 * Claude Code answers `rewind_conversation` before its transcript shows the cut; the chat read
 * any earlier still shows the turns that were taken back. Waits until the prompt is gone there.
 */
const CUT_CHECK_MS = 150
const CUT_CHECKS = 20

const untilTranscriptCut = async (tabId: string, uuid: string) => {
  for (let check = 0; check < CUT_CHECKS; check++) {
    const tab = useChatStore().tabs.find((t) => t.id === tabId)
    if (!tab) return
    const points = await fetchRewindPoints(tab)
    if (!points.some((point) => point.uuid === uuid)) return
    await new Promise((resolve) => setTimeout(resolve, CUT_CHECK_MS))
  }
}

/**
 * Going back to an earlier prompt, as Claude Code's `/rewind` does: Claude restores the files from
 * its checkpoints (`rewind_files`) and cuts the conversation (`rewind_conversation`); Bull only
 * asks and then reads the shortened chat from the transcript. Opened by Esc Esc, the clock in the
 * session bar and the `/rewind` command, all through `openRewind`.
 */
export const useRewindStore = defineStore('rewind', () => {
  /** The tab whose rewind dialog is open; one at a time. */
  const openTabId = ref<string | null>(null)
  /** The prompt the dialog opens on; `null` means the newest. "Bearbeiten" under a prompt sets it. */
  const preferredUuid = ref<string | null>(null)

  /** Opens the dialog for a chat that has prompts and is not in the middle of a turn. */
  const openRewind = (tabId: string, uuid: string | null = null) => {
    const tab = useChatStore().tabs.find((t) => t.id === tabId)
    if (!tab?.sessionId || tab.status === 'working' || tab.status === 'asking') return
    preferredUuid.value = uuid
    openTabId.value = tabId
  }

  const closeRewind = () => {
    openTabId.value = null
    preferredUuid.value = null
  }

  /** Goes back to just before the prompt `uuid`; its text lands in the composer again. */
  const rewind = async (tabId: string, uuid: string, scope: RewindScope) => {
    const chat = useChatStore()
    const steps = rewindStepsOf(scope)
    await chat.ensureStarted(tabId)
    if (steps.files) {
      const files = filesOfRewind(
        await chat.askClaude(tabId, { subtype: 'rewind_files', user_message_id: uuid })
      )
      if (!files.isDone) throw new RewindRefusedError(files.reason, false)
    }
    if (!steps.conversation) return
    const conversation = prefillOfRewind(
      await chat.askClaude(tabId, { subtype: 'rewind_conversation', target_message_uuid: uuid })
    )
    if (!conversation.isDone) throw new RewindRefusedError(conversation.reason, steps.files)
    const prefill = conversation.value
    // Like the terminal: the prompt is back in the input, ready to change and send again. A draft
    // typed meanwhile stays after it instead of being lost.
    const draft = useDraftStore().draftOf(tabId)
    draft.text = [prefill, draft.text].filter(Boolean).join('\n\n')
    await untilTranscriptCut(tabId, uuid)
    await chat.reloadHistory(tabId)
  }

  return { openTabId, preferredUuid, openRewind, closeRewind, rewind }
})
