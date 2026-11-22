import { shallowReadonly, shallowRef } from 'vue'

/** What a terminal's screen shows: its skeleton, the shell, or why the shell did not start. */
export type TerminalStatus =
  { kind: 'starting' } | { kind: 'ready' } | { kind: 'failed'; message: string }

/** Some shells print nothing until a key is pressed; past this the empty terminal shows anyway. */
export const REVEAL_AFTER_MS = 3000
/** A login over SSH takes longer before its banner or password prompt arrives. */
export const REVEAL_AFTER_REMOTE_MS = 10_000

const STARTING: TerminalStatus = { kind: 'starting' }
const READY: TerminalStatus = { kind: 'ready' }

/**
 * The status of one terminal across its starts. A start shows the skeleton until the shell drew
 * something (`reveal`) or ran for `revealAfterMs` without a word; a failed start keeps its message
 * until the next one.
 */
export const createTerminalStatus = (revealAfterMs: number) => {
  const status = shallowRef<TerminalStatus>(STARTING)
  let timer: ReturnType<typeof setTimeout> | undefined

  const settle = (next: TerminalStatus) => {
    clearTimeout(timer)
    status.value = next
  }

  const reveal = () => {
    if (status.value.kind === 'starting') settle(READY)
  }

  return {
    status: shallowReadonly(status),
    start: () => settle(STARTING),
    /** The shell process runs; from here the wait for its first output is capped. */
    spawned: () => {
      clearTimeout(timer)
      timer = setTimeout(reveal, revealAfterMs)
    },
    reveal,
    fail: (message: string) => settle({ kind: 'failed', message }),
    dispose: () => clearTimeout(timer)
  }
}
