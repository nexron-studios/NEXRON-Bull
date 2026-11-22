import type { ClaudeEvent } from '@/types/agentd.type'
import { MS_PER_SECOND } from '@/utils/elapsed'

/** Why Anthropic turned the request down, as far as the card words it differently. */
export const retryReasonList = ['overloaded', 'rate_limit', 'server_error', 'other'] as const
export type RetryReason = (typeof retryReasonList)[number]

/** Claude Code waits and asks Anthropic again; headless it says so with `system`/`api_retry`. */
export interface ApiRetry {
  attempt: number
  maxRetries: number
  /** HTTP status of the failed attempt, e.g. 529; `null` when no answer came at all */
  status: number | null
  reason: RetryReason
  /** When the next attempt starts (ms since epoch) */
  retriesAt: number
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const reasonOf = (error: unknown): RetryReason =>
  retryReasonList.find((reason) => reason === error && reason !== 'other') ?? 'other'

/**
 * The retry an event announces, as Claude Code 2.1.327 writes it:
 * `{type: system, subtype: api_retry, attempt, max_retries, retry_delay_ms, error_status, error}`.
 * There is no request to retry sooner; Claude Code waits on its own.
 */
export const apiRetryOf = (event: ClaudeEvent, now: number): ApiRetry | null => {
  if (event.type !== 'system' || event.subtype !== 'api_retry') return null
  // A subagent's retry is its own; the main turn goes on meanwhile.
  if (event.parent_tool_use_id) return null
  const { attempt, max_retries: maxRetries, retry_delay_ms: delayMs, error_status: status } = event
  if (!isCount(attempt) || !isCount(maxRetries) || !isCount(delayMs)) return null
  return {
    attempt,
    maxRetries,
    status: isCount(status) ? status : null,
    reason: reasonOf(event.error),
    retriesAt: now + delayMs
  }
}

/** Whole seconds until the next attempt, never below zero. */
export const secondsUntil = (retriesAt: number, now: number): number =>
  Math.max(0, Math.ceil((retriesAt - now) / MS_PER_SECOND))
