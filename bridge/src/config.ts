import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentdProcess, Machine } from './relay.ts'

/** Bull's data folder, the same one agentd and the desktop app use. */
const APP_FOLDER = '.nexron-chat'
const DEFAULT_PORT = 3060
const MAX_PORT = 65_535
/** An ssh alias from the bridge user's ~/.ssh/config; never something ssh reads as an option. */
const MACHINE_NAME = /^[A-Za-z0-9][\w.-]{0,62}$/

/** Where the desktop app's setup assistant puts agentd, as in src-tauri/src/connections.rs. */
const REMOTE_COMMAND = String.raw`cmd /d /c .nexron-chat\agentd.exe connect`
/** The same options the Tauri shell gives ssh; see connections.rs for why each is there. */
const SSH_OPTIONS = [
  '-T',
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=10',
  '-o',
  'ServerAliveInterval=15'
]

export interface BridgeConfig {
  port: number
  origins: Set<string>
  machines: string[]
  tokenFile: string
  agentd: string
}

const portOf = (value: string | undefined): number => {
  if (value === undefined) return DEFAULT_PORT
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT)
    throw new Error(`BULL_BRIDGE_PORT "${value}" is no port`)
  return port
}

const listOf = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

/** Exact origins only (`https://host[:port]`): a typo must not open the socket to every page. */
const originsOf = (value: string | undefined): Set<string> => {
  const origins = listOf(value)
  if (!origins.length)
    throw new Error('BULL_BRIDGE_ORIGINS is empty: name the page that serves Bull')
  for (const origin of origins)
    if (URL.parse(origin)?.origin !== origin)
      throw new Error(`BULL_BRIDGE_ORIGINS: "${origin}" is not an origin like https://host`)
  return new Set(origins)
}

const machinesOf = (value: string | undefined): string[] => {
  const machines = listOf(value)
  for (const machine of machines)
    if (!MACHINE_NAME.test(machine))
      throw new Error(`BULL_BRIDGE_MACHINES: "${machine}" is not an ssh alias`)
  return machines
}

export const tokenFileOf = (env: NodeJS.ProcessEnv): string =>
  env.BULL_BRIDGE_TOKENS ?? join(homedir(), APP_FOLDER, 'bridge-tokens')

export const configOf = (env: NodeJS.ProcessEnv): BridgeConfig => ({
  port: portOf(env.BULL_BRIDGE_PORT),
  origins: originsOf(env.BULL_BRIDGE_ORIGINS),
  machines: machinesOf(env.BULL_BRIDGE_MACHINES),
  tokenFile: tokenFileOf(env),
  // Where the desktop app and the setup assistant install it.
  agentd:
    env.BULL_AGENTD ??
    join(homedir(), APP_FOLDER, process.platform === 'win32' ? 'agentd.exe' : 'agentd')
})

/** Windows' own OpenSSH: Git's ssh.exe, often first on PATH, mangles the remote cmd line. */
const sshProgram = (): string =>
  process.platform === 'win32' && process.env.SystemRoot
    ? join(process.env.SystemRoot, 'System32', 'OpenSSH', 'ssh.exe')
    : 'ssh'

/** Program and arguments of the connection to a machine; `null` is the bridge's own. */
export const agentdCommandOf = (
  agentd: string,
  machines: readonly string[],
  machine: Machine
): [string, string[]] => {
  if (machine === null) return [agentd, ['connect']]
  if (!machines.includes(machine)) throw new Error(`unknown machine ${machine}`)
  return [sshProgram(), [...SSH_OPTIONS, machine, REMOTE_COMMAND]]
}

/**
 * `agentd connect` for a machine, here or over `ssh -T`. It starts `agentd serve` when none runs
 * and ends once its stdin closes, so a crashed bridge leaves no relay behind.
 */
export const agentdSpawner =
  (agentd: string, machines: readonly string[]) =>
  (machine: Machine): AgentdProcess => {
    const [program, args] = agentdCommandOf(agentd, machines, machine)
    return spawn(program, args, { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true })
  }
