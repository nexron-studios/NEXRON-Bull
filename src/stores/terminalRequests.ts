import { ref } from 'vue'
import { defineStore } from 'pinia'
import { isTauri } from '@tauri-apps/api/core'
import { toast } from 'vue-sonner'
import i18n from '@/i18n'

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
    // Terminals are processes of the app window: a browser (the phone) says where to go instead.
    if (!isTauri()) return void toast.info(i18n.global.t('terminal.desktop_only'))
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
