export const machineOsList = ['windows', 'macos', 'linux'] as const
export type MachineOs = (typeof machineOsList)[number]

/** Another machine in Bull's own list; `name` is what tabs and queries call it. */
export interface MachineEntry {
  name: string
  /** What ssh connects to: an alias from ~/.ssh/config, a host name or an IP address */
  host: string
  user?: string
  port?: number
  /** What the last check found; unknown before the first one got through */
  os?: MachineOs
}

export const probeReasonList = [
  'ok',
  'offline',
  'auth_failed',
  'host_key_changed',
  'host_key_unknown',
  'no_agentd',
  'agentd_blocked',
  'unsupported_system'
] as const
export type ProbeReason = (typeof probeReasonList)[number]

/** What checking a machine found out. */
export interface MachineProbe {
  reason: ProbeReason
  /** What agentd's hello reported */
  version: string | null
  /** The last lines ssh or Windows wrote */
  detail: string | null
  /** How known_hosts names the machine (the resolved host, not the alias); with a changed key */
  known_host: string | null
  /** The system it runs, once ssh got that far */
  os: MachineOs | null
}

export const installStepList = ['checking', 'stopping', 'copying', 'verifying'] as const
export type InstallStep = (typeof installStepList)[number]

/** Why an install stopped before agentd was checked. */
export type InstallError =
  | { kind: 'tabs_running'; count: number }
  /** agentd runs there but did not say whether chats do */
  | { kind: 'tabs_unknown' }
  | { kind: 'unreachable'; reason: ProbeReason; detail: string | null }
  | { kind: 'copy_failed'; detail: string }
  /** The machine could not fetch agentd from the GitHub release of this Bull version */
  | { kind: 'download_failed'; url: string; detail: string }
  | { kind: 'invalid'; detail: string }

export interface InstallProgress {
  machine: string
  step: InstallStep
}
