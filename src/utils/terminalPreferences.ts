/**
 * The terminal's settings, written by the settings page and read by the terminal. Both sides use
 * these keys and value shapes: the shell as one of `terminalShellList`, the font size in px. No
 * stored shell means the terminal picks one itself (PowerShell 7 when installed).
 */
export const TERMINAL_SHELL_KEY = 'bull.terminal.shell'
export const TERMINAL_FONT_SIZE_KEY = 'bull.terminal.fontSize'

export const terminalShellList = ['pwsh', 'powershell', 'cmd', 'bash'] as const
export type TerminalShell = (typeof terminalShellList)[number]

/** What the settings page offers: the terminal's own pick, or one shell. */
export const terminalShellChoiceList = ['auto', ...terminalShellList] as const
export type TerminalShellChoice = (typeof terminalShellChoiceList)[number]

export const DEFAULT_TERMINAL_FONT_SIZE = 13
/** Small enough for a long build log, large enough to read on a 4K screen. */
export const terminalFontSizeList = [11, 12, 13, 14, 15, 16, 18] as const

/** A stored value from an older build or typed by hand counts as not chosen. */
export const terminalShellChoiceOf = (stored: unknown): TerminalShellChoice =>
  terminalShellList.find((shell) => shell === stored) ?? 'auto'

/** The prompt the settings preview shows; `auto` looks like PowerShell, the shell it usually picks. */
export const TERMINAL_PREVIEW_PROMPT: Record<TerminalShellChoice, string> = {
  auto: 'PS C:\\dev\\nexron-chat>',
  pwsh: 'PS C:\\dev\\nexron-chat>',
  powershell: 'PS C:\\dev\\nexron-chat>',
  cmd: 'C:\\dev\\nexron-chat>',
  bash: '~/dev/nexron-chat $'
}
