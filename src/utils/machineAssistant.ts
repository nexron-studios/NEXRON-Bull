import type { InstallStep, MachineEntry, MachineOs, ProbeReason } from '@/types/machine.type'
import { installStepList } from '@/types/machine.type'

/**
 * The name the previous agentd keeps after an install. An unknown system counts as Windows, as
 * in the app's machine list: every machine listed before systems were known was one.
 */
export const oldAgentdFileOf = (os: MachineOs | null | undefined): string => {
  const system = os ?? 'windows'
  switch (system) {
    case 'windows':
      return 'agentd.old.exe'
    case 'macos':
    case 'linux':
      return 'agentd.old'
    default: {
      const unhandled: never = system
      throw new Error(`Unhandled machine system: ${unhandled}`)
    }
  }
}

/** What the assistant offers after a check: the step that moves the user on. */
export const probeActionList = ['add', 'install', 'fix_key', 'forget_key', 'retry', 'none'] as const
export type ProbeAction = (typeof probeActionList)[number]

/** The way on from each reason; the text lives under `settings.machines.reasons.<reason>`. */
export const probeActionOf = (reason: ProbeReason): ProbeAction => {
  switch (reason) {
    case 'ok':
      return 'add'
    case 'no_agentd':
    case 'agentd_blocked':
      return 'install'
    case 'auth_failed':
      return 'fix_key'
    case 'host_key_changed':
      return 'forget_key'
    case 'offline':
    case 'host_key_unknown':
      return 'retry'
    case 'unsupported_system':
      return 'none'
    default: {
      const unhandled: never = reason
      throw new Error(`Unhandled probe reason: ${unhandled}`)
    }
  }
}

export interface MachineForm {
  host: string
  user: string
  port: string
  name: string
}

export const machineFormProblemList = [
  'host_missing',
  'host_invalid',
  'port',
  'name_taken'
] as const
export type MachineFormProblem = (typeof machineFormProblemList)[number]

const MAX_PORT = 65535
// What ssh takes as a host: names, IPv4, IPv6 in brackets. A leading dash would be an option.
const HOST_PATTERN = /^[\p{L}\p{N}._:[\]%][\p{L}\p{N}._:[\]%-]*$/u
const PORT_PATTERN = /^\d+$/

/** The first problem of the form, `null` when it can be checked. */
export const machineFormProblemOf = (
  form: MachineForm,
  takenNames: readonly string[]
): MachineFormProblem | null => {
  const host = form.host.trim()
  if (!host) return 'host_missing'
  if (!HOST_PATTERN.test(host)) return 'host_invalid'
  const port = form.port.trim()
  if (port && (!PORT_PATTERN.test(port) || Number(port) < 1 || Number(port) > MAX_PORT))
    return 'port'
  const name = (form.name.trim() || host).toLowerCase()
  if (takenNames.some((taken) => taken.toLowerCase() === name)) return 'name_taken'
  return null
}

/** The machine a valid form describes; the name defaults to the host. */
export const machineEntryOf = (form: MachineForm): MachineEntry => {
  const host = form.host.trim()
  const user = form.user.trim()
  const port = form.port.trim()
  return {
    name: form.name.trim() || host,
    host,
    ...(user ? { user } : {}),
    ...(port ? { port: Number(port) } : {})
  }
}

export const machineFormOf = (entry: MachineEntry): MachineForm => ({
  host: entry.host,
  user: entry.user ?? '',
  port: entry.port ? String(entry.port) : '',
  name: entry.name === entry.host ? '' : entry.name
})

const ADMIN_KEYS_FILE = String.raw`C:\ProgramData\ssh\administrators_authorized_keys`
// Administrators and SYSTEM by their SIDs: the group names are translated on a German Windows.
const ADMIN_KEYS_GRANTS = '/inheritance:r /grant *S-1-5-32-544:F /grant *S-1-5-18:F'

/**
 * The line that puts `publicKey` on a Windows machine, typed there after logging in with the
 * password. Wrapped in `powershell -Command`, so it runs the same from cmd and PowerShell. Windows'
 * OpenSSH reads an administrator's keys from one shared file only it and SYSTEM may change.
 */
export const authorizedKeysCommandOf = (publicKey: string, isAdmin: boolean): string => {
  const key = `'${publicKey.trim().replaceAll("'", "''")}'`
  if (isAdmin)
    return `powershell -NoProfile -Command "Add-Content ${ADMIN_KEYS_FILE} ${key}; icacls.exe ${ADMIN_KEYS_FILE} ${ADMIN_KEYS_GRANTS}"`
  return `powershell -NoProfile -Command "New-Item -Force -ItemType Directory ~\\.ssh | Out-Null; Add-Content ~\\.ssh\\authorized_keys ${key}"`
}

/**
 * The same for macOS and Linux, typed into the login shell there; also fine in fish. ssh ignores
 * the keys file when the folder or file may be written by others, hence the modes.
 */
export const unixAuthorizedKeysCommandOf = (publicKey: string): string => {
  const key = `'${publicKey.trim().replaceAll("'", `'"'"'`)}'`
  return `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo ${key} >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
}

/**
 * Removes the old host key, left on the prompt of a terminal on this computer to confirm.
 * `knownHost` is the name ssh stored it under; without it the entry's own host and port.
 */
export const forgetHostKeyCommandOf = (entry: MachineEntry, knownHost: string | null): string => {
  const name = knownHost ?? (entry.port ? `[${entry.host}]:${entry.port}` : entry.host)
  return name.startsWith('[') ? `ssh-keygen -R "${name}"` : `ssh-keygen -R ${name}`
}

export const KEYGEN_COMMAND = 'ssh-keygen -t ed25519'

export const installStepStateList = ['done', 'running', 'waiting'] as const
export type InstallStepState = (typeof installStepStateList)[number]

/** How each step of an install stands while `current` runs. "Stopping" only runs when needed. */
export const installStepsOf = (
  current: InstallStep
): { step: InstallStep; state: InstallStepState }[] => {
  const at = installStepList.indexOf(current)
  return installStepList.map((step, index) => ({
    step,
    state: index < at ? 'done' : index === at ? 'running' : 'waiting'
  }))
}
