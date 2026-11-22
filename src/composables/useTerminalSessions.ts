import { computed } from 'vue'
import { createTerminalSession, type TerminalSession } from '@/lib/terminalSession'
import { useTerminalStore } from '@/stores/terminals'
import { useTerminalPreferences } from '@/composables/useTerminalPreferences'
import { fontSizeOf } from '@/utils/terminal'
import type { TerminalEntry } from '@/utils/terminalEntry'

// The running terminals, by entry id. Not store state: xterm instances and shells are not data,
// and they must outlive every component that shows them (a tab switch, the drawer closing).
const sessions = new Map<string, TerminalSession>()

export const useTerminalSessions = () => {
  const store = useTerminalStore()
  const settings = useTerminalPreferences()
  /** The settings' font size as xterm can draw it */
  const fontSize = computed(() => fontSizeOf(settings.fontSize.value))

  /** The terminal of an entry, started the first time it is shown. */
  const sessionOf = (entry: TerminalEntry): TerminalSession => {
    const known = sessions.get(entry.id)
    if (known) return known
    const session = createTerminalSession({
      ...entry,
      shellChoice: () => settings.shell.value,
      fontSize: fontSize.value,
      onShell: (shell) => store.setShell(entry.id, shell)
    })
    sessions.set(entry.id, session)
    return session
  }

  /** Ends the shells whose entries are gone. */
  const disposeExcept = (ids: readonly string[]) => {
    const kept = new Set(ids)
    for (const [id, session] of sessions) {
      if (kept.has(id)) continue
      session.dispose()
      sessions.delete(id)
    }
  }

  const setFontSize = (size: number) => sessions.forEach((session) => session.setFontSize(size))

  return { sessionOf, disposeExcept, setFontSize, fontSize }
}
