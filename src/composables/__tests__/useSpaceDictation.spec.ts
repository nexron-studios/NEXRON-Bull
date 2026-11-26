import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import i18n from '@/i18n'
import { DictationError, type DictationEvent } from '@/api/services/dictation.service'
import { handleError } from '@/lib/error'
import { useSpaceDictation } from '../useSpaceDictation'

const service = vi.hoisted(() => ({
  start: vi.fn<(language: string, hold: number) => Promise<void>>(),
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

const SPACE = { key: ' ', code: 'Space' }
const mounted: { unmount: () => void }[] = []

/** The id the composer gave the hidden Claude for its current hold. */
const lastHold = (): number => service.start.mock.lastCall?.[1] ?? -1

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
  mounted.push(wrapper)
  const textarea = () => field.value as HTMLTextAreaElement
  // The keyup and blur listeners attach once the textarea is rendered.
  await flushPromises()

  /** Like the browser: a keydown nobody prevented types its key at the caret. */
  const keydown = (key: string, options: KeyboardEventInit = {}) => {
    const code = key === ' ' ? SPACE.code : ''
    const event = new KeyboardEvent('keydown', { key, code, cancelable: true, ...options })
    const isTaken = dictation!.handleKeydown(event)
    if (isTaken || event.defaultPrevented || key.length !== 1) return event
    const { selectionStart: at, selectionEnd: end } = textarea()
    draft.value = `${draft.value.slice(0, at)}${key}${draft.value.slice(end)}`
    textarea().value = draft.value
    textarea().setSelectionRange(at + 1, at + 1)
    return event
  }
  // Space's keyup is listened for on the window, as it bubbles there from the field.
  const keyup = (key: string, code = key === ' ' ? SPACE.code : '') =>
    window.dispatchEvent(new KeyboardEvent('keyup', { key, code }))
  /** Claude starts recording for the hold it was given last (or `hold`). */
  const hear = async (hold?: number) => {
    await flushPromises()
    service.listener?.({ hold: hold ?? lastHold(), type: 'listening' })
  }
  /** Claude shows `text` as recognised so far, for the current hold. */
  const say = (text: string) => service.listener?.({ hold: lastHold(), type: 'interim', text })
  const select = (start: number, end: number) => {
    textarea().focus()
    textarea().value = draft.value
    textarea().setSelectionRange(start, end)
  }
  const caretAt = (at: number) => select(at, at)

  return {
    wrapper,
    draft,
    setCaret,
    keydown,
    keyup,
    hear,
    say,
    caretAt,
    select,
    textarea,
    state: () => dictation!.indicator.value,
    isDictating: () => dictation!.isDictating.value,
    highlights: () => dictation!.highlights.value
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
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
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

    expect(service.start.mock.calls.map(([language]) => language)).toEqual(['de'])
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

    await composer.hear()
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
    await composer.hear()
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
    await composer.hear()
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
  it('should keep swallowing the auto-repeat after a dictation failed while Space is down', async () => {
    const composer = await mountComposer('Hallo')
    service.start.mockRejectedValue(new DictationError('not_ready', ''))
    composer.caretAt(5)
    composer.keydown(' ')
    vi.advanceTimersByTime(250)
    await flushPromises()
    const repeats = [1, 2, 3].map(() => composer.keydown(' ', { repeat: true }))

    expect(repeats.map((event) => event.defaultPrevented)).toEqual([true, true, true])
    expect(composer.draft.value).toBe('Hallo ')
    composer.keyup(' ')
    composer.keydown(' ')
    composer.keyup(' ')
    expect(composer.draft.value).toBe('Hallo  ')
  })

  it('should not let a late failure of an earlier press reset the current one', async () => {
    const composer = await mountComposer('')
    let rejectFirst: (error: unknown) => void = () => undefined
    service.start.mockImplementationOnce(
      () => new Promise<void>((_, reject) => (rejectFirst = reject))
    )
    composer.keydown(' ')
    vi.advanceTimersByTime(300)
    await flushPromises()
    composer.keyup(' ')
    composer.keydown(' ')
    vi.advanceTimersByTime(500)
    expect(composer.state()).toBe('arming')

    const late = new DictationError('not_ready', 'still starting')
    rejectFirst(late)
    await flushPromises()

    expect(composer.state()).toBe('arming')
    expect(handleError).toHaveBeenCalledWith(late)
  })

  it('should give a selection back when the dictation is let go before it records', async () => {
    const composer = await mountComposer('Hallo Welt')
    composer.select(6, 10)
    composer.keydown(' ')
    vi.advanceTimersByTime(500)
    expect(composer.draft.value).toBe('Hallo ')

    composer.keyup(' ')
    await flushPromises()

    expect(composer.draft.value).toBe('Hallo Welt')
    expect(composer.setCaret).toHaveBeenLastCalledWith(10)
  })

  it('should give a selection back when nothing was understood', async () => {
    const composer = await mountComposer('Hallo Welt')
    service.stop.mockRejectedValue(new DictationError('nothing_heard', ''))
    composer.select(6, 10)
    composer.keydown(' ')
    vi.advanceTimersByTime(500)
    await composer.hear()
    composer.keyup(' ')
    await flushPromises()

    expect(composer.draft.value).toBe('Hallo Welt')
  })

  it('should replace a selection with the transcript', async () => {
    const composer = await mountComposer('Hallo Welt')
    service.stop.mockResolvedValue('Bull')
    composer.select(6, 10)
    composer.keydown(' ')
    vi.advanceTimersByTime(500)
    await composer.hear()
    composer.keyup(' ')
    await flushPromises()

    expect(composer.draft.value).toBe('Hallo Bull')
  })

  it('should stop showing the dictation when Claude fails while recording', async () => {
    const composer = await mountComposer('')
    composer.keydown(' ')
    vi.advanceTimersByTime(500)
    await composer.hear()
    service.listener?.({ hold: lastHold(), type: 'failed', code: 'exited', detail: '' })
    await flushPromises()

    expect(composer.state()).toBeNull()
    expect(handleError).toHaveBeenCalledWith(new DictationError('exited', ''))
    expect(service.cancel).toHaveBeenCalledTimes(1)
  })

  it('should not let a late event of an earlier press drive the current one', async () => {
    const composer = await mountComposer('')
    composer.keydown(' ')
    vi.advanceTimersByTime(500)
    await flushPromises()
    const earlier = lastHold()
    composer.keyup(' ')
    composer.keydown(' ')
    vi.advanceTimersByTime(250)
    await composer.hear(earlier)

    expect(composer.state()).toBeNull()
    vi.advanceTimersByTime(250)
    await composer.hear()
    expect(composer.state()).toBe('recording')
  })

  it('should give each press its own hold id', async () => {
    const composer = await mountComposer('')
    const holdBriefly = async () => {
      composer.keydown(' ')
      vi.advanceTimersByTime(300)
      composer.keyup(' ')
      await flushPromises()
    }
    await holdBriefly()
    await holdBriefly()

    expect(new Set(service.start.mock.calls.map(([, hold]) => hold)).size).toBe(2)
  })

  it('should end a press from an input source that sends Space without a key code', async () => {
    const composer = await mountComposer('a')
    composer.caretAt(1)
    composer.keydown(' ', { code: '' })
    vi.advanceTimersByTime(300)
    composer.keyup(' ', '')
    await flushPromises()

    expect([composer.state(), service.cancel.mock.calls.length]).toEqual([null, 1])
  })

  it('should insert the transcript once when the window loses focus while recording', async () => {
    const composer = await mountComposer('')
    service.stop.mockResolvedValue('Hallo')
    composer.keydown(' ')
    vi.advanceTimersByTime(500)
    await composer.hear()

    window.dispatchEvent(new FocusEvent('blur'))
    composer.textarea().dispatchEvent(new FocusEvent('blur'))
    await flushPromises()

    expect([composer.draft.value, service.stop.mock.calls.length]).toEqual(['Hallo', 1])
  })

  it('should end the press by the physical key, also when Option changed the character', async () => {
    const composer = await mountComposer('a')
    composer.caretAt(1)
    composer.keydown(' ')
    composer.keyup('\u00a0', 'Space')
    composer.keydown(' ')
    composer.keyup(' ')

    expect(composer.draft.value).toBe('a  ')
  })

  describe('interim text', () => {
    it('should show what Claude recognised so far where the transcript goes', async () => {
      const composer = await mountComposer('Ich bin müde')
      composer.caretAt(7)
      composer.keydown(' ')
      vi.advanceTimersByTime(500)
      await composer.hear()
      composer.say('seh')
      composer.say('sehr')

      expect(composer.draft.value).toBe('Ich bin sehr müde')
      expect(composer.highlights()).toEqual([{ start: 8, end: 12, kind: 'interim' }])
      expect(composer.setCaret).toHaveBeenLastCalledWith(12)
    })

    it('should replace the interim text by the final transcript', async () => {
      const composer = await mountComposer('Ich bin müde')
      service.stop.mockResolvedValue('sehr, sehr')
      composer.caretAt(7)
      composer.keydown(' ')
      vi.advanceTimersByTime(500)
      await composer.hear()
      composer.say('sehr')
      composer.keyup(' ')
      expect(composer.draft.value).toBe('Ich bin sehr müde')
      await flushPromises()

      expect(composer.draft.value).toBe('Ich bin sehr, sehr müde')
      expect(composer.highlights()).toEqual([])
      expect(composer.setCaret).toHaveBeenLastCalledWith(18)
    })

    it('should give text and selection back when the recording is thrown away', async () => {
      const composer = await mountComposer('Hallo Welt')
      composer.select(6, 10)
      composer.keydown(' ')
      vi.advanceTimersByTime(500)
      await composer.hear()
      composer.say('Bull')
      expect(composer.draft.value).toBe('Hallo Bull')

      composer.keydown('Escape')
      composer.keyup(' ')
      await flushPromises()

      expect(composer.draft.value).toBe('Hallo Welt')
      expect(composer.setCaret).toHaveBeenLastCalledWith(10)
      expect(composer.highlights()).toEqual([])
    })

    it('should take the interim text out when Claude fails while recording', async () => {
      const composer = await mountComposer('Hallo')
      composer.caretAt(5)
      composer.keydown(' ')
      vi.advanceTimersByTime(500)
      await composer.hear()
      composer.say('Welt')
      service.listener?.({ hold: lastHold(), type: 'failed', code: 'exited', detail: '' })
      await flushPromises()

      expect(composer.draft.value).toBe('Hallo')
      expect(composer.setCaret).toHaveBeenLastCalledWith(5)
    })

    it('should take the interim text out when nothing was understood in the end', async () => {
      const composer = await mountComposer('Hallo')
      service.stop.mockRejectedValue(new DictationError('nothing_heard', ''))
      composer.caretAt(5)
      composer.keydown(' ')
      vi.advanceTimersByTime(500)
      await composer.hear()
      composer.say('äh')
      composer.keyup(' ')
      await flushPromises()

      expect(composer.draft.value).toBe('Hallo')
    })

    it('should take the interim text out when Claude no longer shows any', async () => {
      const composer = await mountComposer('Hallo')
      composer.caretAt(5)
      composer.keydown(' ')
      vi.advanceTimersByTime(500)
      await composer.hear()
      composer.say('Welt')
      composer.say('')

      expect([composer.draft.value, composer.highlights()]).toEqual(['Hallo', []])
    })

    it('should ignore interim text of an earlier press', async () => {
      const composer = await mountComposer('Hallo')
      composer.caretAt(5)
      composer.keydown(' ')
      vi.advanceTimersByTime(500)
      await composer.hear()
      service.listener?.({ hold: lastHold() - 1, type: 'interim', text: 'alt' })

      expect(composer.draft.value).toBe('Hallo')
    })

    it('should say a dictation runs from arming until the transcript landed', async () => {
      const composer = await mountComposer('')
      service.stop.mockResolvedValue('Hallo')
      composer.keydown(' ')
      vi.advanceTimersByTime(200)
      const engaged = composer.isDictating()
      vi.advanceTimersByTime(300)
      const arming = composer.isDictating()
      await composer.hear()
      composer.keyup(' ')
      const transcribing = composer.isDictating()
      await flushPromises()

      expect([engaged, arming, transcribing, composer.isDictating()]).toEqual([
        false,
        true,
        true,
        false
      ])
    })
  })
})
