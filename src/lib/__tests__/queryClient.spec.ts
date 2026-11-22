import { describe, expect, it } from 'vitest'
import { AgentdDisconnectedError } from '@/api/services/agentd.service'
import { shouldRetry } from '../queryClient'

describe('shouldRetry', () => {
  it('should not retry a request whose machine could not be reached', () => {
    expect(shouldRetry(0, new AgentdDisconnectedError('nexron-server'))).toBe(false)
  })

  it('should retry other failures up to three times', () => {
    expect([0, 2, 3].map((count) => shouldRetry(count, new Error('bad request')))).toEqual([
      true,
      true,
      false
    ])
  })
})
