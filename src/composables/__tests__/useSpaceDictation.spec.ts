import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import i18n from '@/i18n'
import { DictationError, type DictationEvent } from '@/api/services/dictation.service'
import { handleError } from '@/lib/error'
import { useSpaceDictation } from '../useSpaceDictation'

const service = vi.hoisted(() => ({
  start: vi.fn<(language: string) => Promise<void>>(),
  stop: vi.fn<() => Promise<string>>(),
  cancel: vi.fn<() => Promise<void>>(),
  listener: null as ((event: DictationEvent) => void) | null
}))

vi.mock('@/api/services/dictation.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/dictation.service')>()),
  dictationService: {
    start: service.start,
    stop: service.stop,
    cancel: service.cancel,
    onEvent: (listener: (event: DictationEvent) => void) => {
      service.listener = listener
      return () => (service.listener = null)
    }
  }
}))
vi.mock('@/lib/error', () => ({ handleError: vi.fn() }))

/** The composer's part: a textarea whose keydown goes through the dictation first. */
const mountComposer = async (initial: string, isEnabled = true) => {
  const draft = ref(initial)
  const setCaret = vi.fn()
  let dictation: ReturnType<typeof useSpaceDictation> | null = null
  const field = ref<HTMLTextAreaElement | null>(null)
  const host = defineComponent({
    setup: () => {
      dictation = useSpaceDictation({
        textarea: () => field.value,
        draft,
        isEnabled: () => isEnabled,
        setCaret
      })
      return () => h('textarea', { ref: field, value: draft.value })
    }
  })
  const wrapper = mount(host, { global: { plugins: [i18n] }, attachTo: document.body })
  const textarea = () => field.value as HTMLTextAreaElement
  // The keyup and blur listeners attach once the textarea is rendered.
  await flushPromises()

  /** Like the browser: a keydown nobody prevented types its key at the caret. */
  const keydown = (key: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, ...options })
    const isTaken = dictation!.handleKeydown(event)
    if (isTaken || event.defaultPrevented || key.length !== 1) return event
    const at = textarea().selectionStart
    draft.value = `${draft.value.slice(0, at)}${key}${draft.value.slice(at)}`
    textarea().value = draft.value
    textarea().setSelectionRange(at + 1, at + 1)
    return event
  }
  const keyup = (key: string) => textarea().dispatchEvent(new KeyboardEvent('keyup', { key }))
  const caretAt = (at: number) => {
    textarea().value = draft.value
    textarea().setSelectionRange(at, at)
  }

  return {
    wrapper,
    draft,
    setCaret,
    keydown,
    keyup,
    caretAt,
    state: () => dictation!.indicator.value
  }
}

describe('useSpaceDictation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    i18n.global.locale.value = 'de'
    service.start.mockResolvedValue(undefined)
    service.cancel.mockResolvedValue(undefined)
    service.stop.mockResolvedValue('')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('should leave a short tap a normal space without asking Claude', async () => {
    const composer = await mountComposer('Hallo')
    composer.caretAt(5)
    composer.keydown(' ')
    vi.advanceTimersByTime(100)
    composer.keyup(' ')
    vi.advanceTimersByTime(1000)
    await flushPromises()

    expect(composer.draft.value).toBe('Hallo ')
    expect(service.start).not.toHaveBeenCalled()
    expect(composer.state()).toBeNull()
  })

  it('should keep the space and cancel Claude when let go before the hold counts', async () => {
    const composer = await mountComposer('Hallo')
    composer.caretAt(5)
    composer.keydown(' ')
    vi.advanceTimersByTime(300)
    composer.keyup(' ')
    await flushPromises()

    expect(service.start).toHaveBeenCalledWith('de')
    expect(service.cancel).toHaveBeenCalledTimes(1)
    expect(composer.draft.value).toBe('Hallo ')
  })

  it('should dictate mid-sentence and put the transcript where the caret was', async () => {
    const composer = await mountComposer('Ich bin müde')
    service.stop.mockResolvedValue('sehr')
    composer.caretAt(7)
    composer.keydown(' ')
    vi.advanceTimersByTime(500)
    expect(composer.draft.value).toBe('Ich bin müde')
    expect(composer.state()).toBe('arming')

    service.listener?.({ type: 'listening' })
    const repeat = composer.keydown(' ', { repeat: true })
    expect(repeat.defaultPrevented).toBe(true)
    expect(composer.state()).toBe('recording')

    composer.keyup(' ')
    expect(composer.state()).toBe('transcribing')
    await flushPromises()

    expect(composer.draft.value).toBe('Ich bin sehr müde')
    expect(composer.setCaret).toHaveBeenLastCalledWith(12)
    expect(composer.state()).toBeNull()
  })

  it('should say nothing was understood for a while, without a toast', async () => {
    const composer = await mountComposer('')
    service.stop.mockRejectedValue(new DictationError('nothing_heard', ''))
    composer.keydown(' ')
    vi.advanceTimersByTime(500)
    service.listener?.({ type: 'listening' })
    composer.keyup(' ')
    await flushPromises()

    expect(composer.state()).toBe('error')
    expect(handleError).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2500)
    expect(composer.state()).toBeNull()
    expect(composer.draft.value).toBe('')
  })

  it('should report a Claude that cannot start and stop showing the dictation', async () => {
    const composer = await mountComposer('')
    const missing = new DictationError('claude_missing', '')
    service.start.mockRejectedValue(missing)
    composer.keydown(' ')
    vi.advanceTimersByTime(250)
    await flushPromises()

    expect(handleError).toHaveBeenCalledWith(missing)
    expect(composer.state()).toBeNull()
  })

  it('should throw the recording away on Escape', async () => {
    const composer = await mountComposer('Hallo')
    composer.caretAt(5)
    composer.keydown(' ')
    vi.advanceTimersByTime(500)
    service.listener?.({ type: 'listening' })
    composer.keydown('Escape')
    composer.keyup(' ')
    await flushPromises()

    expect(service.cancel).toHaveBeenCalledTimes(1)
    expect(service.stop).not.toHaveBeenCalled()
    expect(composer.draft.value).toBe('Hallo')
  })

  it('should treat typing on while Space is down as a fast space', async () => {
    const composer = await mountComposer('a')
    composer.caretAt(1)
    composer.keydown(' ')
    composer.keydown('b')
    vi.advanceTimersByTime(1000)
    await flushPromises()

    expect(composer.draft.value).toBe('a b')
    expect(service.start).not.toHaveBeenCalled()
  })

  it('should keep Space a plain space where dictation is off', async () => {
    const composer = await mountComposer('a', false)
    composer.caretAt(1)
    composer.keydown(' ')
    vi.advanceTimersByTime(1000)
    await flushPromises()

    expect(composer.draft.value).toBe('a ')
    expect(service.start).not.toHaveBeenCalled()
  })
})
