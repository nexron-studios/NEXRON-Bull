import { ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { InstallFailedError, machineService } from '@/api/services/machine.service'
import { MACHINES_KEY } from '@/composables/useAgentdCatalog'
import { handleError } from '@/lib/error'
import type { InstallError, InstallStep, MachineEntry, MachineProbe } from '@/types/machine.type'

/** Why the assistant opens: a new machine, or a listed one to check (fix) or to change. */
export type AssistantOpening =
  | { purpose: 'connect' }
  | { purpose: 'check'; entry: MachineEntry }
  | { purpose: 'edit'; entry: MachineEntry }

/** Where the assistant stands; each step carries what it shows. */
export type AssistantState =
  /** `entry`: what the form starts with, the machine of this run once it was checked */
  | { step: 'pick'; entry: MachineEntry | null }
  | { step: 'checking'; entry: MachineEntry }
  /** `isAfterInstall`: the check that followed an install, the old agentd kept beside it */
  | { step: 'checked'; entry: MachineEntry; probe: MachineProbe; isAfterInstall?: boolean }
  | { step: 'installing'; entry: MachineEntry; current: InstallStep }
  | { step: 'install_failed'; entry: MachineEntry; failure: InstallError }
  | { step: 'done'; entry: MachineEntry; probe: MachineProbe }

/**
 * Connecting another machine: check it, install agentd there, done. The machine joins Bull's list
 * with the first check, so its card shows the same problem behind the dialog and Bull's terminal
 * can log into it to fix a key.
 */
export const useMachineAssistant = () => {
  const queryClient = useQueryClient()
  const state = ref<AssistantState>({ step: 'pick', entry: null })
  // What this run put into the list, so a corrected entry replaces it instead of adding a second.
  let added: MachineEntry | null = null

  const refreshList = () => queryClient.invalidateQueries({ queryKey: MACHINES_KEY })

  const check = async (entry: MachineEntry) => {
    state.value = { step: 'checking', entry }
    try {
      // Replaces what an earlier check of this run added, in its place in the list.
      await machineService.add(entry, added?.name ?? null)
      added = entry
      await refreshList()
      const probe = await machineService.test(entry)
      state.value = { step: 'checked', entry, probe }
      // A host that answers again loads its accounts now, not at the next slow poll of a failed one.
      if (probe.reason === 'ok') await queryClient.invalidateQueries({ queryKey: ['agentd'] })
    } catch (error) {
      handleError(error)
      state.value = { step: 'pick', entry }
    }
  }

  const install = async (entry: MachineEntry) => {
    state.value = { step: 'installing', entry, current: 'checking' }
    try {
      const probe = await machineService.install(entry, (current) => {
        state.value = { step: 'installing', entry, current }
      })
      state.value =
        probe.reason === 'ok'
          ? { step: 'done', entry, probe }
          : { step: 'checked', entry, probe, isAfterInstall: true }
    } catch (error) {
      if (!(error instanceof InstallFailedError)) {
        handleError(error)
        state.value = { step: 'pick', entry }
        return
      }
      state.value = { step: 'install_failed', entry, failure: error.failure }
    } finally {
      // The machine answers again (or newly) once its connection may reopen.
      await queryClient.invalidateQueries({ queryKey: ['agentd'] })
    }
  }

  const finish = (entry: MachineEntry, probe: MachineProbe) => {
    state.value = { step: 'done', entry, probe }
  }

  /** A fresh run: at the form, or for a machine to fix right at its check. */
  const start = (opening: AssistantOpening) => {
    const entry = opening.purpose === 'connect' ? null : opening.entry
    added = entry
    state.value = { step: 'pick', entry }
    if (opening.purpose === 'check') void check(opening.entry)
  }

  /** Back to the form, filled with the machine as last checked, so it can be corrected. */
  const back = () => {
    state.value = { step: 'pick', entry: state.value.entry }
  }

  return { state, start, check, install, finish, back }
}
