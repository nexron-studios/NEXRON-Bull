import { computed, onMounted, watch } from 'vue'
import { promiseTimeout, useWindowFocus } from '@vueuse/core'
import { AgentdTimeoutError } from '@/api/services/agentd.service'
import { handleError } from '@/lib/error'
import { useChatStore } from '@/stores/chat'
import { useConnectorSetupStore } from '@/stores/connectorSetup'
import type { Connector } from '@/utils/tabInsights'

/** A reloaded server reports `pending` until it connected; asked again this often, this far apart. */
const SETTLE_TRIES = 5
const SETTLE_INTERVAL_MS = 1000

/**
 * After "Im Terminal einrichten": once the user is back in the chat (the panel shows again, or the
 * window gets focus back from a terminal outside Bull), Claude reads its MCP config again and the
 * panel lists what it found. Once: found nothing, it waits for "Neu laden" instead of reloading
 * Claude's plugins on every focus. Checked with Claude Code 2.1.329: `mcp_status` alone keeps the list
 * from the start, `reload_plugins` picks up a server added with `claude mcp add` and Claude can
 * use its tools in the next turn, so no restart. A turn running then is never disturbed: the check
 * waits for its end. A Claude that refuses the reload gets a restart in the same session instead.
 */
export const useConnectorSetup = (tabId: string) => {
  const chat = useChatStore()
  const setups = useConnectorSetupStore()
  const isFocused = useWindowFocus()

  const status = computed(() => chat.tabs.find((tab) => tab.id === tabId)?.status ?? 'ended')
  const connectorCount = computed(
    () => chat.tabs.find((tab) => tab.id === tabId)?.connectors?.length ?? 0
  )
  const setup = computed(() => setups.setupOf(tabId))
  const isBusy = computed(() => status.value === 'working' || status.value === 'asking')
  /** Owed once after the setup terminal; a check that found nothing waits for "Neu laden". */
  const isDue = computed(() => setup.value === 'due')

  const settle = async (connectors: Connector[]): Promise<Connector[]> => {
    let latest = connectors
    for (let tries = 0; tries < SETTLE_TRIES; tries++) {
      if (!latest.some((connector) => connector.status === 'pending')) break
      await promiseTimeout(SETTLE_INTERVAL_MS)
      latest = await chat.refreshConnectors(tabId)
    }
    return latest
  }

  const finish = (connectors: Connector[]) =>
    setups.set(tabId, connectors.length ? null : 'checked')

  /**
   * A turn that began meanwhile refuses the reload: again once it ends; so does a Claude that
   * stopped, which reads the config when it starts. Claude answering an idle tab with an error
   * means it cannot reload (an older Claude Code): a restart reads the config instead.
   */
  const onReloadFailed = (error: unknown) => {
    if (isBusy.value || status.value !== 'idle') return setups.set(tabId, 'due')
    if (error instanceof AgentdTimeoutError) {
      handleError(error)
      return setups.set(tabId, 'checked')
    }
    console.warn('connectors.reload_failed', {
      message: error instanceof Error ? error.message : String(error)
    })
    setups.set(tabId, 'restart')
  }

  const showConnectors = async (connectors: Promise<Connector[]>) => {
    try {
      finish(await settle(await connectors))
    } catch (error) {
      handleError(error)
      setups.set(tabId, 'checked')
    }
  }

  const check = async () => {
    setups.set(tabId, 'checking')
    try {
      await chat.reloadMcpConfig(tabId)
    } catch (error) {
      return onReloadFailed(error)
    }
    await showConnectors(chat.refreshConnectors(tabId))
  }

  /** Right away while Claude is free; a busy or starting one is checked once it is idle. */
  const checkWhenFree = () => {
    if (status.value === 'idle') return void check()
    setups.set(tabId, 'due')
  }

  /** The setup terminal opens and replaces the chat; the check runs once the user is back. */
  const markOpened = () => setups.set(tabId, 'due')

  /** Claude starts again in the same session and lists the servers its config has now. */
  const restart = async () => {
    setups.set(tabId, 'restarting')
    try {
      await chat.restart(tabId)
    } catch (error) {
      handleError(error)
      return setups.set(tabId, 'restart')
    }
    await showConnectors(chat.refreshConnectors(tabId))
  }

  watch(status, (next) => {
    if (next === 'idle' && isDue.value) void check()
  })
  watch(isFocused, (isNowFocused) => {
    if (isNowFocused && isDue.value) checkWhenFree()
  })
  // Servers that came with a turn instead (a Claude that was not running) end the setup too.
  watch(connectorCount, (count) => {
    if (count > 0 && setup.value) setups.set(tabId, null)
  })

  onMounted(() => {
    if (isDue.value) checkWhenFree()
  })

  return { setup, isBusy, check, markOpened, restart }
}
