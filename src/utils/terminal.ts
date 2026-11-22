import type { ITheme } from '@xterm/xterm'
import type { TerminalRequest } from '@/stores/terminalRequests'
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  terminalShellList,
  type TerminalShell,
  type TerminalShellChoice
} from '@/utils/terminalPreferences'

export const isTerminalShell = (value: unknown): value is TerminalShell =>
  terminalShellList.some((shell) => shell === value)

/**
 * The shell a new terminal starts: the one picked in the settings if it is installed, else what
 * "automatic" picks, PowerShell 7 or else Windows PowerShell, which every Windows has. A picked
 * shell that went missing (uninstalled, a settings value from another PC) is no reason to fail.
 */
export const resolveShell = (
  choice: TerminalShellChoice,
  installed: readonly TerminalShell[]
): TerminalShell => {
  if (choice !== 'auto' && installed.includes(choice)) return choice
  if (installed.includes('pwsh')) return 'pwsh'
  return 'powershell'
}

/** Line height of the terminal, shared with its skeleton so the rows line up */
export const TERMINAL_LINE_HEIGHT = 1.35

const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 32

/** `bull.terminal.fontSize` as a size xterm can draw; anything unreadable is the default. */
export const fontSizeOf = (value: unknown): number => {
  const size = typeof value === 'string' ? Number(value) : value
  if (typeof size !== 'number' || !Number.isFinite(size)) return DEFAULT_TERMINAL_FONT_SIZE
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)))
}

/** Selection: the brand blue, see-through so the text under it stays readable. */
const SELECTION_ALPHA_HEX = '59'
const HEX_COLOR = /^#[0-9a-f]{6}$/i

const withAlpha = (color: string, alphaHex: string): string =>
  HEX_COLOR.test(color) ? `${color}${alphaHex}` : color

/**
 * xterm's colours from Bull's tokens (`read('--brand')` gives the token's value in the current
 * theme). The 16 ANSI colours map onto the palette: red is the critical red, green the good green,
 * blue the brand. Light keeps "white" readable on its light background, so a program that prints
 * white text is not invisible there.
 */
export const terminalThemeOf = (read: (token: string) => string, isDark: boolean): ITheme => {
  const background = read('--background')
  const foreground = read('--foreground')
  const muted = read('--muted-foreground')
  const subtle = read('--subtle')
  const critical = read('--critical')
  const good = read('--good')
  const warning = read('--warning')
  const brand = read('--brand')
  const change = read('--act-change')
  const outside = read('--act-outside')
  return {
    background,
    foreground: subtle,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: withAlpha(brand, SELECTION_ALPHA_HEX),
    black: isDark ? read('--input') : foreground,
    red: critical,
    green: good,
    yellow: warning,
    blue: brand,
    magenta: change,
    cyan: outside,
    white: isDark ? subtle : muted,
    brightBlack: muted,
    brightRed: critical,
    brightGreen: good,
    brightYellow: warning,
    brightBlue: read('--act-read'),
    brightMagenta: change,
    brightCyan: outside,
    brightWhite: isDark ? foreground : subtle
  }
}

/** Single-quoted for PowerShell: only a quote itself needs escaping, by doubling it. */
const powershellString = (value: string): string => `'${value.replaceAll("'", "''")}'`

/**
 * PSReadLine shows a grey guess from the history after a draft, which Right arrow would accept.
 * Asks for the parameter rather than the module: PSReadLine 2.0 (Windows PowerShell 5.1) has no
 * prediction and would refuse it, and a shell without PSReadLine skips the line quietly.
 */
const NO_PREDICTION_LINE =
  "if ('PredictionSource' -in (Get-Command Set-PSReadLineOption -ErrorAction Ignore).Parameters.Keys) { Set-PSReadLineOption -PredictionSource None }"

const POWERSHELL_LIST: readonly TerminalShell[] = ['pwsh', 'powershell']

/**
 * What is typed into a fresh shell once it is ready, as one string with a carriage return per line;
 * a draft comes last without one, so it waits on the prompt for the user to finish.
 * On another machine the terminal is `ssh -t` into the login shell, so its environment and folder
 * are set by typing, in PowerShell, which the Windows hosts log in to; here the shell got both at
 * the start and is `shell`. Single quotes keep `$` and backticks in a folder name literal.
 */
export const startupInputOf = (request: TerminalRequest, shell: TerminalShell): string => {
  const lines: string[] = []
  const isPowerShell = !!request.machine || POWERSHELL_LIST.includes(shell)
  if (request.machine) {
    for (const [name, value] of Object.entries(request.env ?? {}))
      lines.push(`$env:${name} = ${powershellString(value)}`)
    if (request.cwd) lines.push(`cd ${powershellString(request.cwd)}`)
  }
  if (request.draft && isPowerShell) lines.push(NO_PREDICTION_LINE)
  if (request.command) lines.push(request.command)
  return lines.map((line) => `${line}\r`).join('') + (request.draft ?? '')
}

/** First character after the Ctrl key of the key row: Ctrl+C is 0x03, Ctrl+[ is Esc. */
export const controlCharOf = (char: string): string => {
  const code = char.toUpperCase().charCodeAt(0)
  // '@' (0x40) to '_' (0x5f) map onto 0x00 to 0x1f; anything else is sent as typed.
  if (char.length !== 1 || code < 0x40 || code > 0x5f) return char
  return String.fromCharCode(code - 0x40)
}

export interface KeyRowKey {
  label: string
  /** Accessible name when the label is a symbol */
  name: string
  /** What the key sends; `null` for Ctrl, which applies to the next key */
  sequence: string | null
}

/** The keys a phone keyboard lacks (Figma "M24"), with what each sends to the shell. */
export const KEY_ROW: readonly KeyRowKey[] = [
  { label: 'Esc', name: 'Escape', sequence: '\x1b' },
  { label: 'Tab', name: 'Tab', sequence: '\t' },
  { label: 'Ctrl', name: 'Control', sequence: null },
  { label: '↑', name: 'ArrowUp', sequence: '\x1b[A' },
  { label: '↓', name: 'ArrowDown', sequence: '\x1b[B' },
  { label: '←', name: 'ArrowLeft', sequence: '\x1b[D' },
  { label: '→', name: 'ArrowRight', sequence: '\x1b[C' },
  { label: '|', name: '|', sequence: '|' },
  { label: '~', name: '~', sequence: '~' },
  { label: '/', name: '/', sequence: '/' }
]
