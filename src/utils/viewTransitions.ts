/**
 * On `<html>` while a route change animates: only then does the content area carry a name. Its
 * value, `next` or `prev`, says which way the new page arrives; empty, it only fades.
 */
export const ROUTE_TRANSITION_ATTRIBUTE = 'data-route-transition'

/** A second transition or a hidden window skips a running one; it jumps to its end state. */
const SKIPPED_TRANSITION_ERRORS = ['AbortError', 'InvalidStateError']

export const isSkippedTransition = (error: unknown): boolean =>
  error instanceof DOMException && SKIPPED_TRANSITION_ERRORS.includes(error.name)
