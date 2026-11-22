import { computed } from 'vue'
import { useStorage } from '@vueuse/core'
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  TERMINAL_FONT_SIZE_KEY,
  TERMINAL_SHELL_KEY,
  terminalShellChoiceOf,
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

  return { shell, fontSize }
}
