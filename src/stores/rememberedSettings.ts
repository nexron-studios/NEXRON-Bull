import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  rememberedListOf,
  rememberedOf,
  withRemembered,
  withoutSession,
  type ChosenSettings,
  type RememberedSettings
} from '@/utils/rememberedSettings'

/**
 * Mode, model and effort of sessions a tab left (closed, or `/clear` moved it on), by session id,
 * so reopening one from the lists goes on as it was set (Auto, xhigh) instead of on the account's
 * defaults. Open tabs keep theirs in the chat store.
 */
export const useRememberedSettingsStore = defineStore(
  'rememberedSettings',
  () => {
    const remembered = ref<RememberedSettings[]>([])

    const remember = (sessionId: string, chosen: ChosenSettings) => {
      remembered.value = withRemembered(remembered.value, sessionId, chosen)
    }

    /** A session deleted for good can never reopen; its slot goes to another. */
    const forget = (sessionId: string) => {
      remembered.value = withoutSession(remembered.value, sessionId)
    }

    const settingsFor = (sessionId: string): ChosenSettings =>
      rememberedOf(remembered.value, sessionId)

    return { remembered, remember, forget, settingsFor }
  },
  {
    persist: {
      key: 'bull.sessionSettings',
      serializer: {
        serialize: (state) => JSON.stringify({ remembered: state.remembered }),
        deserialize: (text) => {
          const stored: unknown = JSON.parse(text)
          const hasList = typeof stored === 'object' && stored !== null && 'remembered' in stored
          return { remembered: rememberedListOf(hasList ? stored.remembered : null) }
        }
      }
    }
  }
)
