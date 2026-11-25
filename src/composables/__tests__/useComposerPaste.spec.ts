import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { PendingImage } from '@/utils/content'
import type { PastedText } from '@/utils/pastedText'
import { useComposerPaste } from '../useComposerPaste'

const PASTED_AT = new Date(2026, 10, 25, 14, 42, 55)
const LONG_TEXT = Array.from({ length: 30 }, (_, at) => `line ${at + 1}`).join('\n')

const png = (name: string) => new File(['abc'], name, { type: 'image/png' })

const pasteEventOf = (files: File[], text = '') => {
  const event = {
    clipboardData: { files, getData: () => text },
    preventDefault: vi.fn()
  }
  return event as unknown as ClipboardEvent & typeof event
}

const setup = (isShell = false) => {
  const added: string[][] = []
  const pastes = ref<PastedText[]>([])
  let api: ReturnType<typeof useComposerPaste> | undefined
  mount(
    defineComponent({
      setup: () => {
        api = useComposerPaste({
          images: ref<PendingImage[]>([]),
          pastes,
          isShell: ref(isShell),
          addFiles: async (files) => {
            added.push([...files].map((file) => file.name))
          }
        })
        return () => null
      }
    }),
    { global: { plugins: [i18n] } }
  )
  if (!api) throw new Error('composable did not run')
  return { ...api, added, pastes }
}

describe('useComposerPaste', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(PASTED_AT)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should name pasted screenshots by the time of the paste, a number apart', () => {
    const { handlePaste, added } = setup()

    handlePaste(pasteEventOf([png('image.png'), png('image.png')]))

    expect(added).toEqual([['Image 14-42-55.png', 'Image 14-42-55 (2).png']])
  })

  it('should keep the name of a pasted file that has one', () => {
    const { handlePaste, added } = setup()

    handlePaste(pasteEventOf([png('logo.png')]))

    expect(added).toEqual([['logo.png']])
  })

  it('should attach a pasted image in a shell command too', () => {
    const { handlePaste, added } = setup(true)

    handlePaste(pasteEventOf([png('image.png')]))

    expect(added).toEqual([['Image 14-42-55.png']])
  })

  it('should leave a long text to the shell command instead of making it a chip', () => {
    const { handlePaste, pastes } = setup(true)
    const event = pasteEventOf([], LONG_TEXT)

    handlePaste(event)

    expect(pastes.value).toEqual([])
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
