import type { AgentdEvent } from '@/types/agentd.type'

/**
 * A prompt sent into a running turn that Claude has not read yet (Jonas, 25.11.2026). Claude reads
 * it at its next tool result; one that comes after the last of them it takes as the next turn,
 * right after the turn's `result` (measured 16.11.2026).
 */
export interface Steering {
  /** The uuid Claude knows the message by, to withdraw it while it waits */
  stamp: string
  /** A tool result or the turn's end came since it was sent: Claude's next words come after it */
  isDue: boolean
  /** A turn ended with it unread, and the tab stayed running for the turn Claude starts with it */
  isCarried: boolean
}

export const steeringOf = (stamp: string): Steering => ({
  stamp,
  isDue: false,
  isCarried: false
})

/** Claude's turn ended: `result`. An error result is a stop, a failure or a cut. */
export const turnEndOf = (event: AgentdEvent): { isError: boolean } | null =>
  event.type === 'claude' && event.event.type === 'result'
    ? { isError: event.event.is_error === true }
    : null

/** Claude gets a tool's result: it reads waiting prompts along with it. */
export const isToolResultEvent = (event: AgentdEvent): boolean =>
  event.type === 'message' &&
  event.message.role === 'user' &&
  event.message.blocks.some((block) => block.type === 'tool_result')

/** After a point where Claude reads what waits: a tool result, or the turn's end. */
export const withReadingPoint = (steering: Steering, isTurnEnd: boolean): Steering => ({
  ...steering,
  isDue: true,
  isCarried: steering.isCarried || isTurnEnd
})
