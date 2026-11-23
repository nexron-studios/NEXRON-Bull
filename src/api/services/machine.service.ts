import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { bridgeService } from '@/api/services/bridge.service'
import type {
  InstallError,
  InstallProgress,
  MachineEntry,
  MachineProbe
} from '@/types/machine.type'

const INSTALL_EVENT = 'machine_install'

/** An install that stopped early, with why; any other rejection is a plain `Error`. */
export class InstallFailedError extends Error {
  readonly failure: InstallError

  constructor(failure: InstallError) {
    super(`agentd install failed: ${failure.kind}`)
    this.name = 'InstallFailedError'
    this.failure = failure
  }
}

const isInstallError = (value: unknown): value is InstallError =>
  typeof value === 'object' && value !== null && 'kind' in value

export const machineService = {
  /**
   * Bull's own list; the very first call adopts the ~/.ssh/config hosts that work. In a browser
   * the bridge's list: the machines it reaches besides its own, by their ssh alias there.
   */
  list: async (): Promise<MachineEntry[]> => {
    if (isTauri()) return invoke<MachineEntry[]>('list_machines')
    await bridgeService.whenReady()
    return bridgeService.state.machines.map((name) => ({ name, host: name }))
  },

  /** ~/.ssh/config hosts not in the list yet */
  suggestions: (): Promise<string[]> => invoke<string[]>('machine_suggestions'),

  /** The public key ssh offers first; `null` when this computer has none yet */
  publicKey: (): Promise<string | null> => invoke<string | null>('ssh_public_key'),

  /** Adds the machine, or puts it in the place of the one named `replacing` */
  add: (entry: MachineEntry, replacing: string | null = null): Promise<MachineEntry[]> =>
    invoke<MachineEntry[]>('add_machine', { entry, replacing }),

  remove: (name: string): Promise<MachineEntry[]> =>
    invoke<MachineEntry[]>('remove_machine', { name }),

  test: (entry: MachineEntry): Promise<MachineProbe> =>
    invoke<MachineProbe>('test_machine', { entry }),

  /** Copies the agentd this app ships; `onStep` hears each step of this machine's install. */
  install: async (
    entry: MachineEntry,
    onStep: (step: InstallProgress['step']) => void
  ): Promise<MachineProbe> => {
    const unlisten = await listen<InstallProgress>(INSTALL_EVENT, ({ payload }) => {
      if (payload.machine === entry.name) onStep(payload.step)
    })
    try {
      return await invoke<MachineProbe>('install_agentd', { entry })
    } catch (error) {
      throw isInstallError(error) ? new InstallFailedError(error) : error
    } finally {
      unlisten()
    }
  }
}
