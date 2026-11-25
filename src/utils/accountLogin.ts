import type { Machine } from '@/api/services/agentd.service'
import type { ProfileProps } from '@/types/agentd.type'
import type { MachineOs } from '@/types/machine.type'
import type { TerminalRequest } from '@/stores/terminalRequests'
import { homeOfProfileDir } from '@/utils/accountSettings'
import type { ChatTabState } from '@/utils/chatTab'

export const LOGIN_COMMAND = 'claude /login'
/** `~/.claude` is listed under this label; agentd never sets `CLAUDE_CONFIG_DIR` for it. */
const DEFAULT_PROFILE_LABEL = 'default'

/**
 * Claude Code reads `.claude.json` next to `~/.claude` but inside every other profile folder, so
 * the default profile must log in without `CLAUDE_CONFIG_DIR`.
 */
const configEnvOf = (profile: ProfileProps): Record<string, string> =>
  profile.label === DEFAULT_PROFILE_LABEL ? {} : { CLAUDE_CONFIG_DIR: profile.dir }

/** The terminal that logs an account in: in the home folder, with its profile folder set. */
export const loginRequestOf = (
  machine: Machine,
  profile: ProfileProps,
  title: string
): TerminalRequest => ({
  machine,
  cwd: homeOfProfileDir(profile.dir),
  command: LOGIN_COMMAND,
  env: configEnvOf(profile),
  title
})

/** A PowerShell literal: a quote inside is doubled, so a home folder like O'Brien stays one string. */
const powershellStringOf = (value: string): string => `'${value.replaceAll("'", "''")}'`

/** A POSIX shell literal: a quote inside ends the string, adds an escaped quote and reopens it. */
const posixStringOf = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`

/** How a shell sets the profile folder for the login command that follows. */
const withConfigDirOn = (os: MachineOs, dir: string): string => {
  switch (os) {
    case 'windows':
      return `$env:CLAUDE_CONFIG_DIR = ${powershellStringOf(dir)}; ${LOGIN_COMMAND}`
    case 'macos':
    case 'linux':
      return `CLAUDE_CONFIG_DIR=${posixStringOf(dir)} ${LOGIN_COMMAND}`
    default: {
      const unhandled: never = os
      throw new Error(`Unhandled machine system: ${unhandled}`)
    }
  }
}

/** The same login typed by hand in a terminal outside Bull, in the shell of the machine's system. */
export const loginCommandLineOf = (profile: ProfileProps, os: MachineOs): string => {
  const dir = configEnvOf(profile).CLAUDE_CONFIG_DIR
  return dir ? withConfigDirOn(os, dir) : LOGIN_COMMAND
}

export const MCP_COMMAND = 'claude /mcp'
/**
 * Left on the prompt for the user to complete with a name and a command or URL. User scope, because
 * the panel says the account has none; the default scope would add it to this folder only.
 */
export const MCP_ADD_DRAFT = 'claude mcp add --scope user '

type ChatPlace = Pick<ChatTabState, 'machine' | 'cwd' | 'profile' | 'account'>

const chatEnvOf = (tab: ChatPlace): Record<string, string> =>
  tab.profile ? configEnvOf({ label: tab.account, dir: tab.profile, email: null }) : {}

/**
 * The terminal that signs a connector in: Claude Code's `/mcp` in the chat's folder, on its
 * machine and account, where it offers "Authenticate" for a server that needs it.
 */
export const connectorLoginRequestOf = (tab: ChatPlace, title: string): TerminalRequest => ({
  machine: tab.machine,
  cwd: tab.cwd,
  command: MCP_COMMAND,
  env: chatEnvOf(tab),
  title
})

/**
 * The terminal that sets up a first connector: `/mcp` can only list servers, so a shell in the
 * chat's folder, on its machine and account, with `claude mcp add` waiting on the prompt. Nothing
 * runs before it: a program that owns the console could swallow the typed-ahead draft. Nothing is
 * added until the user finishes the command and presses Enter.
 */
export const connectorSetupRequestOf = (tab: ChatPlace, title: string): TerminalRequest => ({
  machine: tab.machine,
  cwd: tab.cwd,
  draft: MCP_ADD_DRAFT,
  env: chatEnvOf(tab),
  title
})
