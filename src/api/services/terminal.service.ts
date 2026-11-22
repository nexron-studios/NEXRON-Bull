import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { Machine } from '@/api/services/agentd.service'
import type { TerminalShell } from '@/utils/terminalPreferences'

const TERMINAL_EVENT = 'terminal'

export type TerminalEvent =
  { type: 'output'; id: number; data: string } | { type: 'exit'; id: number; code: number }

export interface TerminalSpawnPayload {
  machine: Machine
  /** Empty: the home folder */
  cwd: string
  shell: TerminalShell
  env: Record<string, string>
  cols: number
  rows: number
}

type Listener = (event: TerminalEvent) => void

const listeners = new Set<Listener>()
let unlisten: Promise<UnlistenFn> | null = null

// One window listener for every terminal; output for a terminal is routed by its id.
const ensureListening = () =>
  (unlisten ??= listen<TerminalEvent>(TERMINAL_EVENT, ({ payload }) =>
    listeners.forEach((listener) => listener(payload))
  ))

export const terminalService = {
  /** The shells installed on this machine, in Bull's order of preference */
  shells: (): Promise<TerminalShell[]> => invoke<TerminalShell[]>('terminal_shells'),

  /** Starts a shell; its output arrives through `onEvent` with the returned id. */
  spawn: async (request: TerminalSpawnPayload): Promise<number> => {
    await ensureListening()
    return invoke<number>('terminal_spawn', { request })
  },

  write: (id: number, data: string): Promise<void> => invoke('terminal_write', { id, data }),

  resize: (id: number, cols: number, rows: number): Promise<void> =>
    invoke('terminal_resize', { id, cols, rows }),

  kill: (id: number): Promise<void> => invoke('terminal_kill', { id }),

  killAll: (): Promise<void> => invoke('terminal_kill_all'),

  onEvent: (listener: Listener): (() => void) => {
    void ensureListening()
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}
