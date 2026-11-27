import { computed, onScopeDispose, ref, type Ref } from 'vue'
import { useEventListener, useStorage, useTimeoutFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import {
  DictationError,
  dictationService,
  type DictationEvent
} from '@/api/services/dictation.service'
import { useDictationInterim } from '@/composables/useDictationInterim'
import { handleError } from '@/lib/error'
import {
  isSpaceKey,
  withoutHeldSpace,
  withRestored,
  withTranscript,
  type DictationIndicator,
  type DictationState,
  type SpacePress,
  type TextEdit
} from '@/utils/dictation'

/** A tap is over by then; from here Bull holds Space in Claude as well, which warms up first. */
const ENGAGE_MS = 200
/** Held this long, Space dictates instead of typing (Jonas, 26.11.2026: "ab etwa ½ s"). */
const HOLD_MS = 500
const ERROR_SHOW_MS = 2500
const SPACE_CODE = 'Space'
const HAS_DICTATED_STORAGE_KEY = 'bull.dictation.used'

// The physical key, or the character where an input source sends no code (on-screen keyboards,
// remote desktops): a press must end the way it started.
const isSpaceEvent = (event: KeyboardEvent): boolean =>
  event.code === SPACE_CODE || event.key === ' '

// Shared by every composer, so a press id names one press in the whole window: the hidden
// Claude's events come back with it and must not reach another composer's press.
let pressCount = 0

interface SpaceDictationOptions {
  textarea: () => HTMLTextAreaElement | null | undefined
  draft: Ref<string>
  /** Off in the browser, in the shell mode and wherever Space must stay a plain space */
  isEnabled: () => boolean
  setCaret: (at: number) => void
}

const isNothingHeard = (error: unknown): error is DictationError =>
  error instanceof DictationError && error.code === 'nothing_heard'

/**
 * Hold Space in the composer to dictate with Claude Code's own dictation (`dictation.service`).
 * A tap types its space as always; held for `HOLD_MS` that space goes again, and on release the
 * transcript lands where the caret was, ready to edit. While Claude records, what it recognised
 * so far shows there already (`useDictationInterim`). Nothing is sent.
 */
export const useSpaceDictation = ({
  textarea,
  draft,
  isEnabled,
  setCaret
}: SpaceDictationOptions) => {
  const state = ref<DictationState>({ kind: 'idle' })
  const { locale } = useI18n()
  // Claude needs about 5 s from cold before it records, so the composer warms it up on focus.
  // Only for someone who dictated before: everyone else would run a hidden Claude for nothing.
  const hasDictated = useStorage(HAS_DICTATED_STORAGE_KEY, false, localStorage)
  // The key itself, apart from the dictation: once a dictation failed while Space is still down,
  // the system's auto-repeat must not type a row of spaces until it is let go.
  let isSpaceDown = false

  const indicator = computed<DictationIndicator | null>(() => {
    const { kind } = state.value
    return kind === 'idle' || kind === 'pressed' || kind === 'engaged' ? null : kind
  })
  /** The draft may hold interim words now, or will get the transcript: nothing may send it. */
  const isDictating = computed(() => {
    const { kind } = state.value
    return kind === 'arming' || kind === 'recording' || kind === 'transcribing'
  })

  // One call at a time: a release waits until its press reached Claude.
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task)
    queue = next.catch(() => undefined)
    return next
  }

  /** The press the state belongs to; a press that is over gets no say any more. */
  const currentPress = (): SpacePress | null =>
    state.value.kind === 'idle' || state.value.kind === 'error' ? null : state.value.press
  const isCurrent = (press: SpacePress) => currentPress()?.id === press.id

  // A release by losing focus must not pull the focus back.
  const apply = ({ text, caret }: TextEdit) => {
    draft.value = text
    if (document.activeElement === textarea()) setCaret(caret)
  }
  const interim = useDictationInterim(draft, apply)

  /** The dictation yielded nothing: the interim words go, the selection its space replaced comes back. */
  const giveBack = (press: SpacePress) => {
    const at = interim.takeOut() ?? press.anchor
    if (press.replaced) apply(withRestored(draft.value, at, press.replaced))
  }

  const errorTimer = useTimeoutFn(
    () => {
      if (state.value.kind === 'error') state.value = { kind: 'idle' }
    },
    ERROR_SHOW_MS,
    { immediate: false }
  )

  const fail = (press: SpacePress, error: unknown) => {
    // A press that is over only reports a real failure; it does not touch a newer one.
    if (!isCurrent(press)) {
      if (!isNothingHeard(error)) handleError(error)
      return
    }
    const { kind } = state.value
    if (kind !== 'pressed' && kind !== 'engaged') giveBack(press)
    if (isNothingHeard(error)) {
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
    const { press } = state.value
    const edit = withoutHeldSpace(draft.value, press.anchor)
    apply(edit)
    state.value = { kind: 'arming', press: { ...press, anchor: edit.caret } }
  }

  const engage = () => {
    if (state.value.kind !== 'pressed') return
    const { press } = state.value
    state.value = { kind: 'engaged', press }
    enqueue(() => dictationService.start(locale.value, press.id)).catch((error) =>
      fail(press, error)
    )
  }

  const engageTimer = useTimeoutFn(engage, ENGAGE_MS, { immediate: false })
  const holdTimer = useTimeoutFn(commit, HOLD_MS, { immediate: false })

  const press = (field: HTMLTextAreaElement) => {
    errorTimer.stop()
    pressCount += 1
    isSpaceDown = true
    const { selectionStart, selectionEnd } = field
    const replaced = draft.value.slice(selectionStart, selectionEnd)
    state.value = { kind: 'pressed', press: { id: pressCount, anchor: selectionStart, replaced } }
    engageTimer.start()
    holdTimer.start()
  }

  const insert = (press: SpacePress, transcript: string) => {
    if (!isCurrent(press)) return
    const at = interim.takeOut() ?? press.anchor
    apply(withTranscript(draft.value, at, transcript))
    state.value = { kind: 'idle' }
  }

  /** Throws the dictation away, as if Space had never been held. */
  const discard = (press: SpacePress) => {
    engageTimer.stop()
    holdTimer.stop()
    giveBack(press)
    state.value = { kind: 'idle' }
    cancelInClaude()
  }

  /** The press is over: a tap stays a space, a recording becomes text. */
  const endPress = () => {
    engageTimer.stop()
    holdTimer.stop()
    const current = state.value
    switch (current.kind) {
      case 'pressed':
        state.value = { kind: 'idle' }
        return
      case 'engaged':
        state.value = { kind: 'idle' }
        return cancelInClaude()
      case 'arming':
        return discard(current.press)
      case 'recording': {
        const { press } = current
        state.value = { kind: 'transcribing', press }
        enqueue(dictationService.stop).then(
          (transcript) => insert(press, transcript),
          (error) => fail(press, error)
        )
        return
      }
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

  /** Space is up, or the field lost focus. */
  const release = () => {
    isSpaceDown = false
    endPress()
  }

  const handleEvent = (event: DictationEvent) => {
    const { kind } = state.value
    const press = currentPress()
    if (!press || press.id !== event.hold || kind === 'pressed' || kind === 'transcribing') return
    if (event.type === 'failed') {
      fail(press, new DictationError(event.code, event.detail))
      return cancelInClaude()
    }
    if (kind === 'engaged') commit()
    if (state.value.kind === 'arming') {
      state.value = { kind: 'recording', press: state.value.press }
      hasDictated.value = true
    }
    if (event.type === 'interim' && state.value.kind === 'recording') {
      interim.show(state.value.press.anchor, event.text)
    }
  }

  /** `true` when the key was the dictation's; the composer then leaves it alone. */
  const handleKeydown = (event: KeyboardEvent): boolean => {
    // Space while a press is running or its key is still down: the auto-repeat, which must not
    // type a row of spaces, whatever became of the dictation.
    if (isSpaceEvent(event) && (isSpaceDown || currentPress())) {
      event.preventDefault()
      return true
    }
    const current = state.value
    const field = textarea()
    if (current.kind === 'idle' || current.kind === 'error') {
      if (field && isEnabled() && isSpaceKey(event) && !event.repeat) press(field)
      return false
    }
    // Typing on while Space is down: it was a fast space, not a hold.
    if (current.kind === 'pressed' || current.kind === 'engaged') {
      endPress()
      return false
    }
    // While dictating the text stays put; Esc throws the recording away.
    event.preventDefault()
    if (event.key === 'Escape' && current.kind !== 'transcribing') discard(current.press)
    return true
  }

  // On the window, by the physical key: a keyup with Option held reports another character, and
  // a textarea rendered anew while Space is down never gets the keyup nor a blur.
  useEventListener(window, 'keyup', (event: KeyboardEvent) => {
    if (isSpaceEvent(event)) release()
  })
  useEventListener(window, 'blur', release)
  useEventListener(textarea, 'blur', release)
  useEventListener(textarea, 'focus', () => {
    if (hasDictated.value && isEnabled()) dictationService.warm(locale.value).catch(handleError)
  })
  const stopListening = dictationService.onEvent(handleEvent)
  onScopeDispose(() => {
    stopListening()
    const current = state.value
    if (current.kind === 'engaged') cancelInClaude()
    if (current.kind === 'arming' || current.kind === 'recording') discard(current.press)
  })

  return { state, indicator, isDictating, highlights: interim.highlights, handleKeydown }
}
