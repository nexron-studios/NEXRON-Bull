import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentdDisconnectedError } from '@/api/services/agentd.service'
import i18n from '@/i18n'
import { handleError } from '../error'

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast: { error: toastError } }))

describe('handleError', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'de'
    toastError.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('should name the machine that could not be reached', () => {
    handleError(new AgentdDisconnectedError('nexron-server'))

    expect(toastError).toHaveBeenCalledWith(
      'nexron-server ist nicht erreichbar. Versuch es noch einmal, sobald der Rechner wieder online ist.'
    )
  })

  it('should call this computer by its name when it is the one lost', () => {
    handleError(new AgentdDisconnectedError(null))

    expect(toastError).toHaveBeenCalledWith(
      'Dieser PC ist nicht erreichbar. Versuch es noch einmal, sobald der Rechner wieder online ist.'
    )
  })

  it('should show any other error with its message', () => {
    handleError(new Error('bad request'))

    expect(toastError).toHaveBeenCalledWith('Etwas ist schiefgelaufen: bad request')
  })
})
