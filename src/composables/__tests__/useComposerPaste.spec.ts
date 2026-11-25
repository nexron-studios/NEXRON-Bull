import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { PendingImage } from '@/utils/content'
import type { PastedText } from '@/utils/pastedText'
import { useComposerPaste } from '../useComposerPaste'

const png = (name: string) => new File(['abc'], name, { type: 'image/png' })

const pendingOf = (file: File): PendingImage => ({
  id: `id-${file.name}`,
  name: file.name,
  mediaType: 'image/png',
  data: 'QUJD',
  src: 'data:image/png;base64,QUJD',
  bytes: 3
})

const pasteEventOf = (files: File[]) =>
  ({
    clipboardData: { files, getData: () => '' },
    preventDefault: vi.fn()
  }) as unknown as ClipboardEvent

const setup = (accept: (files: File[]) => File[] = (files) => files, isShell = false) => {
  const onSinglePaste = vi.fn()
  let api: ReturnType<typeof useComposerPaste> | undefined
  mount(
    defineComponent({
      setup: () => {
        api = useComposerPaste({
          images: ref<PendingImage[]>([]),
          pastes: ref<PastedText[]>([]),
          isShell: ref(isShell),
          addFiles: async (files) => accept([...files]).map(pendingOf),
          onSinglePaste
        })
        return () => null
      }
    }),
    { global: { plugins: [i18n] } }
  )
  if (!api) throw new Error('composable did not run')
  return { ...api, onSinglePaste }
}

describe('useComposerPaste', () => {
  it('should open a single pasted image for marking', async () => {
    const { handlePaste, onSinglePaste } = setup()

    handlePaste(pasteEventOf([png('shot.png')]))
    await vi.waitFor(() => expect(onSinglePaste).toHaveBeenCalledTimes(1))

    expect(onSinglePaste.mock.calls[0]?.[0]?.id).toBe('id-shot.png')
  })

  it('should not open anything when several images are pasted at once', async () => {
    const { handlePaste, onSinglePaste } = setup()

    handlePaste(pasteEventOf([png('a.png'), png('b.png')]))
    await new Promise((resolve) => setTimeout(resolve))

    expect(onSinglePaste).not.toHaveBeenCalled()
  })

  it('should not open anything for a screenshot pasted into a shell command', async () => {
    const { handlePaste, onSinglePaste } = setup(undefined, true)

    handlePaste(pasteEventOf([png('shot.png')]))
    await new Promise((resolve) => setTimeout(resolve))

    expect(onSinglePaste).not.toHaveBeenCalled()
  })

  it('should not open anything when the pasted image was turned away', async () => {
    const { handlePaste, onSinglePaste } = setup(() => [])

    handlePaste(pasteEventOf([png('huge.png')]))
    await new Promise((resolve) => setTimeout(resolve))

    expect(onSinglePaste).not.toHaveBeenCalled()
  })
})
