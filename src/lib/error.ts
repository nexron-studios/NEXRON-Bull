import { toast } from 'vue-sonner'
import { AgentdDisconnectedError } from '@/api/services/agentd.service'
import { useMachineNames } from '@/composables/useMachineNames'
import i18n from '@/i18n'

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
  const message = error instanceof Error ? error.message : String(error)
  console.error('app.error', { message })
  toast.error(i18n.global.t('errors.unexpected', { message }))
}
