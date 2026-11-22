import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { systemNameOf } from '@/utils/platform'
import { hasLoginShell } from '@/utils/terminal'
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  TERMINAL_FONT_SIZE_KEY,
  TERMINAL_SHELL_KEY,
  terminalShellChoiceOf,
  type TerminalShell,
  type TerminalShellChoice
} from '@/utils/terminalPreferences'

/**
 * The terminal's shell and font size as the settings page shows and changes them. Nothing is
 * written until the user picks: an empty shell key lets the terminal choose by what is installed.
 */
export const useTerminalPreferences = () => {
  const storedShell = useStorage<string | null>(TERMINAL_SHELL_KEY, null, localStorage, {
    writeDefaults: false
  })
  const fontSize = useStorage<number>(
    TERMINAL_FONT_SIZE_KEY,
    DEFAULT_TERMINAL_FONT_SIZE,
    localStorage,
    {
      writeDefaults: false
    }
  )

  const shell = computed<TerminalShellChoice>({
    get: () => terminalShellChoiceOf(storedShell.value),
    // `null` removes the key.
    set: (choice) => {
      storedShell.value = choice === 'auto' ? null : choice
    }
  })

  // A Mac or Linux starts the login shell whatever is stored, so that is the shell to name.
  const isLoginShell = hasLoginShell(systemNameOf(navigator.userAgent))
  const shownShell = computed<TerminalShellChoice | TerminalShell>(() =>
    isLoginShell ? 'login' : shell.value
  )

  return { shell, shownShell, isLoginShell, fontSize }
}
