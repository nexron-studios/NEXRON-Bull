import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ConnectorSetup } from '@/utils/panelStates'

/**
 * Per chat tab, where setting up a first connector stands. A store, because the panel that shows
 * it goes away while the setup terminal replaces the chat and comes back with the chat.
 */
export const useConnectorSetupStore = defineStore('connectorSetup', () => {
  const setups = ref<Record<string, ConnectorSetup>>({})

  const setupOf = (tabId: string): ConnectorSetup | null => setups.value[tabId] ?? null

  /** `null` ends the setup: the servers showed up or there is nothing left to wait for. */
  const set = (tabId: string, setup: ConnectorSetup | null) => {
    const rest = Object.fromEntries(Object.entries(setups.value).filter(([id]) => id !== tabId))
    setups.value = setup ? { ...rest, [tabId]: setup } : rest
  }

  return { setups, setupOf, set }
})
