/** What goes back, as Claude Code's `/rewind` offers it (Figma "34"). */
export const rewindScopeList = ['both', 'conversation', 'code'] as const
export type RewindScope = (typeof rewindScopeList)[number]

/** The parts of a rewind in the order Claude Code runs them: files first, then the chat. */
export const rewindStepsOf = (scope: RewindScope): { files: boolean; conversation: boolean } => {
  switch (scope) {
    case 'both':
      return { files: true, conversation: true }
    case 'conversation':
      return { files: false, conversation: true }
    case 'code':
      return { files: true, conversation: false }
    default: {
      const unhandled: never = scope
      throw new Error(`Unhandled rewind scope: ${unhandled}`)
    }
  }
}

/** Code can only go back where Claude Code backed the files up before the prompt. */
export const scopesFor = (hasCheckpoint: boolean): RewindScope[] =>
  hasCheckpoint ? [...rewindScopeList] : ['conversation']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** What Claude did with a rewind request; `reason` is its own words when it refused. */
export type RewindOutcome<T> = { isDone: true; value: T } | { isDone: false; reason: string }

const refusalOf = (response: Record<string, unknown>): string =>
  typeof response.error === 'string' ? response.error : String(response.reason ?? 'refused')

const NO_ANSWER = 'no answer'

/** The files `rewind_files` restores or would restore (`dry_run`), or why it cannot. */
export const filesOfRewind = (response: unknown): RewindOutcome<string[]> => {
  if (!isRecord(response)) return { isDone: false, reason: NO_ANSWER }
  if (response.canRewind !== true) return { isDone: false, reason: refusalOf(response) }
  const files = Array.isArray(response.filesChanged) ? response.filesChanged : []
  return { isDone: true, value: files.filter((file): file is string => typeof file === 'string') }
}

const TRAILING_LINE_BREAKS = /[\r\n]+$/

/**
 * The prompt `rewind_conversation` took back, for the composer, or why it refused. A prompt piped
 * in (`echo … | claude -p`) is stored with its final line break, which would leave the caret on
 * an empty line, so every trailing line break goes; the inner ones belong to the prompt.
 */
export const prefillOfRewind = (response: unknown): RewindOutcome<string> => {
  if (!isRecord(response)) return { isDone: false, reason: NO_ANSWER }
  if (response.rewound !== true) return { isDone: false, reason: refusalOf(response) }
  const prefill = typeof response.prefillText === 'string' ? response.prefillText : ''
  return { isDone: true, value: prefill.replace(TRAILING_LINE_BREAKS, '') }
}

/** `C:\work\src\tokens.css` → `tokens.css`. */
export const fileNameOf = (path: string): string => path.split(/[\\/]/).at(-1) ?? path
