import { describe, expect, it } from 'vitest'
import { apiRetryOf, secondsUntil } from '../apiRetry'

// As `claude -p --output-format stream-json` 2.1.327 announces a retry, per its output schema.
const retryEvent = {
  type: 'system',
  subtype: 'api_retry',
  attempt: 2,
  max_retries: 10,
  retry_delay_ms: 8000,
  error_status: 529,
  error: 'overloaded',
  uuid: 'e1',
  session_id: 's1'
}

describe('apiRetryOf', () => {
  it('should read attempt, wait and status of a retry', () => {
    expect(apiRetryOf(retryEvent, 1_000)).toEqual({
      attempt: 2,
      maxRetries: 10,
      status: 529,
      reason: 'overloaded',
      retriesAt: 9_000
    })
  })

  it('should word an unknown error and a missing answer generically', () => {
    const event = { ...retryEvent, error: 'invalid_request', error_status: null }
    expect(apiRetryOf(event, 0)).toMatchObject({ reason: 'other', status: null })
  })

  it('should ignore other events', () => {
    expect(apiRetryOf({ type: 'system', subtype: 'init' }, 0)).toBeNull()
    expect(apiRetryOf({ ...retryEvent, attempt: 'two' }, 0)).toBeNull()
  })

  it('should leave the retry of a subagent out of the main chat', () => {
    expect(apiRetryOf({ ...retryEvent, parent_tool_use_id: 'toolu_1' }, 0)).toBeNull()
  })
})

describe('secondsUntil', () => {
  it('should round up and stop at zero', () => {
    expect(secondsUntil(9_000, 1_500)).toBe(8)
    expect(secondsUntil(9_000, 12_000)).toBe(0)
  })
})
