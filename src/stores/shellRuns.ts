import { ref } from 'vue'
import { defineStore } from 'pinia'
import { agentdService } from '@/api/services/agentd.service'
import { useMachineNames } from '@/composables/useMachineNames'
import i18n from '@/i18n'
import type { ChatTabState } from '@/utils/chatTab'
import { isUnknownOpError } from '@/utils/sessionActions'

/** agentd stops a command after 120 s; past this the machine is gone, not the command slow. */
const SHELL_ANSWER_TIMEOUT_MS = 150 * 1000

export const shellRunStateList = ['running', 'done', 'failed'] as const
export type ShellRunState = (typeof shellRunStateList)[number]

/** One `!` command of a tab that has not gone to Claude yet. */
export interface ShellRun {
  id: string
  command: string
  state: ShellRunState
  stdout: string
  stderr: string
  /** `null` while it runs, when it failed to start or was stopped at the timeout */
  code: number | null
  durationMs: number | null
  isTimedOut: boolean
  /** Why it did not run (no shell, folder gone, an agentd without the op) */
  error: string | null
}

/**
 * `!` commands, like Claude Code's bash mode: they run in the chat's folder on the chat's machine
 * at once, show in the chat, and go to Claude with the next prompt.
 */
export const useShellRunsStore = defineStore('shellRuns', () => {
  const byTab = ref<Record<string, ShellRun[]>>({})

  const runsOf = (tabId: string): ShellRun[] => byTab.value[tabId] ?? []

  const change = (tabId: string, id: string, update: Partial<ShellRun>) => {
    byTab.value = {
      ...byTab.value,
      [tabId]: runsOf(tabId).map((run) => (run.id === id ? { ...run, ...update } : run))
    }
  }

  const start = async (tab: Pick<ChatTabState, 'id' | 'cwd' | 'machine'>, command: string) => {
    const run: ShellRun = {
      id: crypto.randomUUID(),
      command,
      state: 'running',
      stdout: '',
      stderr: '',
      code: null,
      durationMs: null,
      isTimedOut: false,
      error: null
    }
    byTab.value = { ...byTab.value, [tab.id]: [...runsOf(tab.id), run] }
    try {
      const result = await agentdService.ask<'shell_result'>(
        { op: 'run_shell', cwd: tab.cwd, command },
        tab.machine,
        SHELL_ANSWER_TIMEOUT_MS
      )
      change(tab.id, run.id, {
        state: 'done',
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        durationMs: result.duration_ms,
        isTimedOut: result.is_timed_out
      })
    } catch (error) {
      // Shown in the block itself, where the command was typed; no toast on top.
      const machine = useMachineNames().nameOf(tab.machine)
      const message = isUnknownOpError(error, 'run_shell')
        ? i18n.global.t('prompt_input.agentd_outdated', { machine })
        : (error as Error).message
      change(tab.id, run.id, { state: 'failed', error: message })
    }
  }

  const remove = (tabId: string, id: string) => {
    byTab.value = { ...byTab.value, [tabId]: runsOf(tabId).filter((run) => run.id !== id) }
  }

  /** The finished commands, for the prompt going out now; they leave the list. Failed ones stay. */
  const takeDone = (tabId: string): ShellRun[] => {
    const done = runsOf(tabId).filter((run) => run.state === 'done')
    if (!done.length) return []
    byTab.value = { ...byTab.value, [tabId]: runsOf(tabId).filter((run) => run.state !== 'done') }
    return done
  }

  /** Runs a prompt took along that never reached Claude: back in front, for the next one. */
  const putBack = (tabId: string, runs: ShellRun[]) => {
    if (runs.length) byTab.value = { ...byTab.value, [tabId]: [...runs, ...runsOf(tabId)] }
  }

  const forget = (tabId: string) => {
    const { [tabId]: _forgotten, ...rest } = byTab.value
    byTab.value = rest
  }

  return { byTab, runsOf, start, remove, takeDone, putBack, forget }
})
