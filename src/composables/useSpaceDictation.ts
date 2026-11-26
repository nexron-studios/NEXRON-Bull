import { computed, onScopeDispose, ref, type Ref } from 'vue'
import { useEventListener, useTimeoutFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import {
  DictationError,
  dictationService,
  type DictationEvent
} from '@/api/services/dictation.service'
import { handleError } from '@/lib/error'
import {
  isSpaceKey,
  withoutHeldSpace,
  withTranscript,
  type DictationIndicator,
  type DictationState
} from '@/utils/dictation'

/** A tap is over by then; from here Bull holds Space in Claude as well, which warms up first. */
const ENGAGE_MS = 200
/** Held this long, Space dictates instead of typing (Jonas, 26.11.2026: "ab etwa ½ s"). */
const HOLD_MS = 500
const ERROR_SHOW_MS = 2500

interface SpaceDictationOptions {
  textarea: () => HTMLTextAreaElement | null | undefined
  draft: Ref<string>
  /** Off in the browser, in the shell mode and wherever Space must stay a plain space */
  isEnabled: () => boolean
  setCaret: (at: number) => void
}

/**
 * Hold Space in the composer to dictate with Claude Code's own dictation (`dictation.service`).
 * A tap types its space as always; held for `HOLD_MS` that space goes again, and on release the
 * transcript lands where the caret was, ready to edit. Nothing is sent.
 */
export const useSpaceDictation = ({
  textarea,
  draft,
  isEnabled,
  setCaret
}: SpaceDictationOptions) => {
  const state = ref<DictationState>({ kind: 'idle' })
  const { locale } = useI18n()

  const indicator = computed<DictationIndicator | null>(() => {
    const { kind } = state.value
    return kind === 'idle' || kind === 'pressed' || kind === 'engaged' ? null : kind
  })

  // One call at a time: a release waits until its press reached Claude.
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task)
    queue = next.catch(() => undefined)
    return next
  }

  const errorTimer = useTimeoutFn(
    () => {
      if (state.value.kind === 'error') state.value = { kind: 'idle' }
    },
    ERROR_SHOW_MS,
    { immediate: false }
  )

  const fail = (error: unknown) => {
    if (error instanceof DictationError && error.code === 'nothing_heard') {
      state.value = { kind: 'error', code: error.code }
      errorTimer.start()
      return
    }
    state.value = { kind: 'idle' }
    handleError(error)
  }

  const cancelInClaude = () => void enqueue(dictationService.cancel).catch(handleError)

  const commit = () => {
    if (state.value.kind !== 'engaged') return
    const { text, caret } = withoutHeldSpace(draft.value, state.value.anchor)
    draft.value = text
    setCaret(caret)
    state.value = { kind: 'arming', anchor: caret }
  }

  const engage = () => {
    if (state.value.kind !== 'pressed') return
    state.value = { kind: 'engaged', anchor: state.value.anchor }
    enqueue(() => dictationService.start(locale.value)).catch(fail)
  }

  const engageTimer = useTimeoutFn(engage, ENGAGE_MS, { immediate: false })
  const holdTimer = useTimeoutFn(commit, HOLD_MS, { immediate: false })

  const press = (field: HTMLTextAreaElement) => {
    errorTimer.stop()
    state.value = { kind: 'pressed', anchor: field.selectionStart }
    engageTimer.start()
    holdTimer.start()
  }

  const insert = (transcript: string) => {
    if (state.value.kind !== 'transcribing') return
    const { text, caret } = withTranscript(draft.value, state.value.anchor, transcript)
    draft.value = text
    setCaret(caret)
    state.value = { kind: 'idle' }
  }

  /** Space is up, or the field lost focus: a tap stays a space, a recording becomes text. */
  const release = () => {
    engageTimer.stop()
    holdTimer.stop()
    const current = state.value
    switch (current.kind) {
      case 'pressed':
        state.value = { kind: 'idle' }
        return
      case 'engaged':
      case 'arming':
        state.value = { kind: 'idle' }
        return cancelInClaude()
      case 'recording':
        state.value = { kind: 'transcribing', anchor: current.anchor }
        enqueue(dictationService.stop).then(insert, fail)
        return
      case 'transcribing':
      case 'error':
      case 'idle':
        return
      default: {
        const unhandled: never = current
        throw new Error(`Unhandled dictation state: ${JSON.stringify(unhandled)}`)
      }
    }
  }

  const handleEvent = (event: DictationEvent) => {
    const { kind } = state.value
    if (event.type === 'failed') {
      if (kind !== 'engaged' && kind !== 'arming') return
      fail(new DictationError(event.code, event.detail))
      return cancelInClaude()
    }
    if (kind === 'engaged') commit()
    if (state.value.kind === 'arming') {
      state.value = { kind: 'recording', anchor: state.value.anchor }
    }
  }

  /** `true` when the key was the dictation's; the composer then leaves it alone. */
  const handleKeydown = (event: KeyboardEvent): boolean => {
    const { kind } = state.value
    const field = textarea()
    if (kind === 'idle' || kind === 'error') {
      if (field && isEnabled() && isSpaceKey(event) && !event.repeat) press(field)
      return false
    }
    // The key's auto-repeat, which must not type a row of spaces.
    if (event.key === ' ') {
      event.preventDefault()
      return true
    }
    // Typing on while Space is down: it was a fast space, not a hold.
    if (kind === 'pressed' || kind === 'engaged') {
      release()
      return false
    }
    // While dictating the text stays put; Esc throws the recording away.
    event.preventDefault()
    if (event.key === 'Escape' && kind !== 'transcribing') {
      engageTimer.stop()
      holdTimer.stop()
      state.value = { kind: 'idle' }
      cancelInClaude()
    }
    return true
  }

  useEventListener(textarea, 'keyup', (event: KeyboardEvent) => {
    if (event.key === ' ') release()
  })
  useEventListener(textarea, 'blur', release)
  const stopListening = dictationService.onEvent(handleEvent)
  onScopeDispose(() => {
    stopListening()
    const { kind } = state.value
    if (kind === 'engaged' || kind === 'arming' || kind === 'recording') cancelInClaude()
  })

  return { state, indicator, handleKeydown }
}
