import type { TerminalRequest } from '@/stores/terminalRequests'
import { isTerminalShell } from '@/utils/terminal'
import type { TerminalShell } from '@/utils/terminalPreferences'

/** Room for about a dozen lines of a build log under the chat (Figma "23b"). */
export const DEFAULT_DRAWER_HEIGHT = 260
export const MIN_DRAWER_HEIGHT = 120
/** The chat above keeps at least this share of the column. */
export const MAX_DRAWER_SHARE = 0.7

export interface TerminalEntry extends TerminalRequest {
  id: string
  /** `null` until the shell started and took the one from the settings */
  shell: TerminalShell | null
  /** The chat whose drawer shows it; `null` for a terminal tab of its own */
  drawerOf: string | null
}

/** What a terminal tab keeps across a restart: enough to start a fresh shell in the same place. */
export type SavedTerminal = Pick<TerminalEntry, 'id' | 'machine' | 'cwd' | 'shell' | 'title'>

export const terminalOfRequest = (
  id: string,
  request: TerminalRequest,
  drawerOf: string | null
): TerminalEntry => ({ ...request, id, shell: null, drawerOf })

/** The command and environment are left out: they were meant for the first shell only. */
export const savedTerminalOf = (entry: TerminalEntry): SavedTerminal => ({
  id: entry.id,
  machine: entry.machine,
  cwd: entry.cwd,
  shell: entry.shell,
  title: entry.title
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Saved tabs from storage that still make sense; an edited or old value drops what does not. */
export const savedTerminalsOf = (value: unknown): SavedTerminal[] => {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).flatMap((item) => {
    if (typeof item.id !== 'string' || typeof item.cwd !== 'string') return []
    return [
      {
        id: item.id,
        machine: typeof item.machine === 'string' ? item.machine : null,
        cwd: item.cwd,
        shell: isTerminalShell(item.shell) ? item.shell : null,
        title: typeof item.title === 'string' ? item.title : undefined
      }
    ]
  })
}

/** A drawer height that leaves the chat above usable in a column of `columnHeight` px. */
export const clampDrawerHeight = (height: number, columnHeight: number): number =>
  Math.round(Math.max(MIN_DRAWER_HEIGHT, Math.min(height, columnHeight * MAX_DRAWER_SHARE)))
