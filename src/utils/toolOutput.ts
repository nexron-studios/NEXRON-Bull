import { resultTextOf, type ToolResultBlock } from '@/utils/toolPairs'

/** How many of a shell's last lines the card shows before "N Zeilen davor". */
export const SHOWN_TAIL_LINES = 5
const SHELL_TOOL_NAMES = ['Bash', 'PowerShell']
const TRAILING_NEWLINES = /\n+$/

export const isShellTool = (name: string): boolean => SHELL_TOOL_NAMES.includes(name)

/** The last lines of an output and how many come before them, like the terminal shows a run. */
export const outputTailOf = (
  text: string,
  shown: number = SHOWN_TAIL_LINES
): { hidden: number; lines: string[] } => {
  const lines = text.replace(TRAILING_NEWLINES, '').split('\n')
  const hidden = Math.max(0, lines.length - shown)
  return { hidden, lines: lines.slice(hidden) }
}

/** A PreToolUse hook that stopped a call: which tool, the hook's command and what it said. */
export interface HookBlock {
  tool: string
  command: string | null
  reason: string
}

// Claude Code 2.1.327 answers a blocked call with `${hookName} hook error: ${blockingError}`, and
// for an exit code 2 the error is `[command]: stderr`; the brackets may hold one level of brackets.
const PRE_TOOL_BLOCK =
  /^PreToolUse:(\S+) hook error: (?:\[((?:[^[\]]|\[[^[\]]*\])*)\]: )?([\s\S]*)$/

/** `null` for any result a hook did not block. */
export const hookBlockOf = (result: ToolResultBlock | null): HookBlock | null => {
  if (!result?.is_error) return null
  const match = resultTextOf(result).trim().match(PRE_TOOL_BLOCK)
  if (!match?.[1]) return null
  return { tool: match[1], command: match[2] ?? null, reason: (match[3] ?? '').trim() }
}
