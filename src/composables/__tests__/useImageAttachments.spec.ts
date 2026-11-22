import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'vue-sonner'
import i18n from '@/i18n'
import { useImageAttachments } from '../useImageAttachments'

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn() } }))

// Reads finish on a later tick, like the real FileReader; a file named broken.png fails.
class FakeReader {
  result: string | null = null
  error: Error | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  readAsDataURL(file: File) {
    setTimeout(() => {
      if (file.name === 'broken.png') {
        this.error = new Error('unreadable')
        this.onerror?.()
        return
      }
      this.result = `data:${file.type};base64,QUJD`
      this.onload?.()
    })
  }
}

const png = (name: string) => new File(['abc'], name, { type: 'image/png' })
const pngs = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, at) => png(`${prefix}${at + 1}.png`))

const setup = () => {
  let api: ReturnType<typeof useImageAttachments> | undefined
  mount(
    defineComponent({
      setup: () => {
        api = useImageAttachments()
        return () => null
      }
    }),
    { global: { plugins: [i18n] } }
  )
  if (!api) throw new Error('composable did not run')
  return api
}

describe('useImageAttachments', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'de'
    vi.stubGlobal('FileReader', FakeReader)
    vi.mocked(toast.error).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should keep overlapping drops within the limit and name the ones left out', async () => {
    const { images, addFiles } = setup()
    await Promise.all([addFiles(pngs('a', 6)), addFiles(pngs('b', 6))])
    expect([images.value.length, vi.mocked(toast.error).mock.calls]).toEqual([
      10,
      [['Höchstens 10 Bilder pro Nachricht. Nicht angehängt: b5.png, b6.png.']]
    ])
  })

  it('should report as reading until the files are read', async () => {
    const { isReading, addFiles } = setup()
    const adding = addFiles([png('a.png')])
    const whileReading = isReading.value
    await adding
    expect([whileReading, isReading.value]).toEqual([true, false])
  })

  it('should keep the readable images when one file fails to read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { images, addFiles } = setup()
    await addFiles([png('a.png'), png('broken.png'), png('c.png')])
    expect([images.value.map((image) => image.name), vi.mocked(toast.error).mock.calls]).toEqual([
      ['a.png', 'c.png'],
      [['Nicht lesbar: broken.png.']]
    ])
    warn.mockRestore()
  })

  it('should store the data URL and base64 separately and name a pasted image', async () => {
    const { images, addFiles } = setup()
    await addFiles([new File(['abc'], '', { type: 'image/png' })])
    const [image] = images.value
    expect([image?.name, image?.data, image?.src, image?.bytes]).toEqual([
      'Eingefügtes Bild',
      'QUJD',
      'data:image/png;base64,QUJD',
      3
    ])
  })

  describe('placeMarkedImages', () => {
    const marked = (id: string) => ({
      id,
      name: `${id}.png`,
      mediaType: 'image/png' as const,
      data: 'QUJD',
      src: 'data:image/png;base64,QUJD',
      bytes: 3,
      isMarked: true
    })

    it('should replace the source attachment with the marked copy and the original', async () => {
      const { images, addFiles, placeMarkedImages } = setup()
      await addFiles([png('a.png'), png('b.png')])
      const [first, second] = images.value
      if (!first || !second) throw new Error('images missing')

      const isPlaced = placeMarkedImages(first.id, [marked('m'), first])

      expect([isPlaced, images.value.map((image) => image.name)]).toEqual([
        true,
        ['m.png', 'a.png', 'b.png']
      ])
    })

    it('should refuse with a toast when the message would hold too many images', async () => {
      const { images, addFiles, placeMarkedImages } = setup()
      await addFiles(pngs('a', 10))

      const isPlaced = placeMarkedImages(null, [marked('m')])

      expect([isPlaced, images.value.length, vi.mocked(toast.error).mock.calls]).toEqual([
        false,
        10,
        [['Höchstens 10 Bilder pro Nachricht. Entferne erst ein Bild.']]
      ])
    })
  })
})
