/** No output for this long after the first: the shell has printed its prompt and waits. */
export const READY_QUIET_MS = 300
/** A shell that keeps printing (or never prints) still gets its input after this. */
export const READY_MAX_MS = 5000

/**
 * Calls `onReady` once the shell looks ready for typed input: when its output went quiet after the
 * first chunk, or at the latest `maxMs` after the start. A login over SSH prints a banner first and
 * PowerShell loads its profile; typing earlier would land in the middle of that.
 */
export const createReadyGate = (
  onReady: () => void,
  quietMs: number = READY_QUIET_MS,
  maxMs: number = READY_MAX_MS
) => {
  let isDone = false
  let quietTimer: ReturnType<typeof setTimeout> | undefined
  const fire = () => {
    if (isDone) return
    isDone = true
    clearTimeout(quietTimer)
    clearTimeout(maxTimer)
    onReady()
  }
  const maxTimer = setTimeout(fire, maxMs)

  /** Every chunk of output pushes the quiet period back. */
  const output = () => {
    if (isDone) return
    clearTimeout(quietTimer)
    quietTimer = setTimeout(fire, quietMs)
  }

  /** The shell went away first; nothing will be typed. */
  const cancel = () => {
    isDone = true
    clearTimeout(quietTimer)
    clearTimeout(maxTimer)
  }

  return { output, cancel }
}
