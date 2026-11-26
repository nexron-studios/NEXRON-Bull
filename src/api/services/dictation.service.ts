import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

const DICTATION_EVENT = 'dictation'

/** What `src-tauri/src/dictation.rs` reports a failure as; `errors.dictation.<code>` says it. */
export const dictationErrorCodeList = [
  'claude_missing',
  'spawn_failed',
  'not_ready',
  'exited',
  'not_listening',
  'nothing_heard',
  'timeout',
  'not_holding',
  'io'
] as const
export type DictationErrorCode = (typeof dictationErrorCodeList)[number]

export class DictationError extends Error {
  readonly code: DictationErrorCode
  /** What Claude or the system said, in its own words */
  readonly detail: string

  constructor(code: DictationErrorCode, detail: string) {
    super(`dictation ${code}${detail ? `: ${detail}` : ''}`)
    this.name = 'DictationError'
    this.code = code
    this.detail = detail
  }
}

export type DictationEvent =
  { type: 'listening' } | { type: 'failed'; code: DictationErrorCode; detail: string }

type Listener = (event: DictationEvent) => void

const isCode = (code: unknown): code is DictationErrorCode =>
  dictationErrorCodeList.some((known) => known === code)

/** A rejected command as the Rust side shapes it (`{ code, detail }`), else left alone. */
const toDictationError = (error: unknown): unknown => {
  if (typeof error !== 'object' || error === null) return error
  const { code, detail } = error as { code?: unknown; detail?: unknown }
  if (!isCode(code)) return error
  return new DictationError(code, typeof detail === 'string' ? detail : '')
}

const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw toDictationError(error)
  }
}

const listeners = new Set<Listener>()
let unlisten: Promise<UnlistenFn> | null = null

const ensureListening = () =>
  (unlisten ??= listen<DictationEvent>(DICTATION_EVENT, ({ payload }) =>
    listeners.forEach((listener) => listener(payload))
  ))

/** Claude Code's own dictation through a hidden `claude` on this machine (desktop app only). */
export const dictationService = {
  /** Holds Space in Claude; `listening` follows once it records. */
  start: async (language: string): Promise<void> => {
    await ensureListening()
    return call('dictation_start', { language })
  },

  /** Lets go and resolves with the transcript. */
  stop: (): Promise<string> => call<string>('dictation_stop'),

  /** Lets go and throws away what was recorded. */
  cancel: (): Promise<void> => call('dictation_cancel'),

  onEvent: (listener: Listener): (() => void) => {
    void ensureListening()
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}
