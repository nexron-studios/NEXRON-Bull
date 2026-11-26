import { toast } from '@/lib/toast'
import { AgentdDisconnectedError, type Machine } from '@/api/services/agentd.service'
import { DictationError } from '@/api/services/dictation.service'
import { useMachineNames } from '@/composables/useMachineNames'
import i18n from '@/i18n'
import { isUnknownOpError } from '@/utils/sessionActions'

const isCancellation = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

/** The single path from an error to the user: a translated toast. */
export const handleError = (error: unknown): void => {
  if (isCancellation(error)) return
  // Not a bug but the state of a machine: say which one, without agentd's English wording.
  if (error instanceof AgentdDisconnectedError) {
    const machine = useMachineNames().nameOf(error.machine)
    console.warn('agentd.unreachable', { machine: error.machine })
    toast.error(i18n.global.t('errors.unreachable', { machine }))
    return
  }
  // Claude Code's dictation failed: Bull's sentence, with what Claude said behind it.
  if (error instanceof DictationError) {
    console.warn('dictation.failed', { code: error.code, detail: error.detail })
    toast.error(i18n.global.t(`errors.dictation.${error.code}`, { detail: error.detail }))
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  console.error('app.error', { message })
  toast.error(i18n.global.t('errors.unexpected', { message }))
}

/** Like `handleError`, but an agentd from before `op` gets named: that machine needs a new one. */
export const reportAgentdFailure = (error: unknown, op: string | null, machine: Machine): void => {
  if (op && isUnknownOpError(error, op)) {
    toast.error(i18n.global.t('session_actions.outdated', { machine: machine ?? '' }))
    return
  }
  handleError(error)
}
