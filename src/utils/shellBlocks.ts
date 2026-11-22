import type { Block, PromptBlock } from '@/types/agentd.type'

/** A finished `!` command, as it goes to Claude. */
export interface ShellOutcome {
  command: string
  stdout: string
  stderr: string
}

const INPUT_OPEN = '<bash-input>'
const INPUT_CLOSE = '</bash-input>'
const STDOUT_OPEN = '<bash-stdout>'
const STDOUT_CLOSE = '</bash-stdout>'
const STDERR_OPEN = '<bash-stderr>'
const STDERR_CLOSE = '</bash-stderr>'

/**
 * The command and its output in the tags Claude Code writes for its own `!` mode, so Claude
 * reads them the same way as in the terminal: two text blocks before the prompt.
 */
export const shellPromptBlocks = ({ command, stdout, stderr }: ShellOutcome): PromptBlock[] => [
  { type: 'text', text: `${INPUT_OPEN}${command}${INPUT_CLOSE}` },
  {
    type: 'text',
    text: `${STDOUT_OPEN}${stdout}${STDOUT_CLOSE}${STDERR_OPEN}${stderr}${STDERR_CLOSE}`
  }
]

const between = (text: string, open: string, close: string): string | null => {
  const start = text.indexOf(open)
  if (start < 0) return null
  const end = text.indexOf(close, start + open.length)
  return end < 0 ? null : text.slice(start + open.length, end)
}

/** The block agentd makes of such a text (`agentd/src/chat.rs`), for the prompt shown meanwhile. */
export const shellBlockOf = (text: string): Block | null => {
  const trimmed = text.trimStart()
  if (trimmed.startsWith(INPUT_OPEN)) {
    const command = between(trimmed, INPUT_OPEN, INPUT_CLOSE)
    return command === null ? null : { type: 'shell', command: command.trim() }
  }
  if (!trimmed.startsWith(STDOUT_OPEN) && !trimmed.startsWith(STDERR_OPEN)) return null
  return {
    type: 'shell_output',
    stdout: (between(trimmed, STDOUT_OPEN, STDOUT_CLOSE) ?? '').trimEnd(),
    stderr: (between(trimmed, STDERR_OPEN, STDERR_CLOSE) ?? '').trimEnd()
  }
}
