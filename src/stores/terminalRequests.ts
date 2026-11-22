import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface TerminalRequest {
  /** SSH host from `~/.ssh/config`, `null` for this machine */
  machine: string | null
  /** Working directory of the shell */
  cwd: string
  /** Typed into the shell once it is ready, e.g. `claude /login` */
  command?: string
  /** Typed after `command` but not sent: left on the prompt for the user to finish */
  draft?: string
  /** Extra environment for the shell, e.g. `CLAUDE_CONFIG_DIR` of a new account */
  env?: Record<string, string>
  /** Tab title; the terminal names itself after the folder otherwise */
  title?: string
}

/**
 * Asks for a terminal from anywhere in the app (settings, menus) without knowing how terminals
 * are opened. The terminal feature takes the requests in order and opens a tab for each.
 */
export const useTerminalRequestStore = defineStore('terminalRequests', () => {
  const pending = ref<TerminalRequest[]>([])

  const request = (terminal: TerminalRequest) => {
    pending.value = [...pending.value, terminal]
  }

  /** Hands out every pending request once and empties the queue. */
  const takeAll = (): TerminalRequest[] => {
    const taken = pending.value
    pending.value = []
    return taken
  }

  return { pending, request, takeAll }
})
