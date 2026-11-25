import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'vue-sonner'
import i18n from '@/i18n'
import type { PendingImage } from '@/utils/content'
import { prependLine } from '@/utils/attachments'
import { useComposerMarkup } from '../useComposerMarkup'
import { useImageAttachments } from '../useImageAttachments'
import { useImageReferences } from '../useImageReferences'

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn() } }))

const imageOf = (id: string, name: string): PendingImage => ({
  id,
  name,
  mediaType: 'image/png',
  data: 'QUJD',
  src: 'data:image/png;base64,QUJD',
  bytes: 3
})

const NBSP = '\u00a0'
/** A reference as the composer writes it: no-break spaces, so its chip never wraps. */
const chipOf = (n: number, name: string) => `[Image${NBSP}${n}${NBSP}(${name})]`

/**
 * The composer's real attachments and references; `hasChips`: each attached image already has its
 * chip in the draft, as after a paste.
 */
const setup = ({
  attached = [] as PendingImage[],
  isShellAtStart = false,
  hasChips = true
} = {}) => {
  const sent: [string, string[]][] = []
  const images = ref<PendingImage[]>([])
  const draft = ref('')
  const isShell = ref(isShellAtStart)
  let api: ReturnType<typeof useComposerMarkup> | undefined
  mount(
    defineComponent({
      setup: () => {
        const references = useImageReferences(draft, images)
        const attachments = useImageAttachments(images, ref(0), references.follow)
        images.value = attached
        if (hasChips) references.insert(attached, null)
        api = useComposerMarkup({
          images,
          isShell,
          references,
          placeMarkedImages: attachments.placeMarkedImages,
          remove: attachments.remove,
          prependComment: (line) => {
            draft.value = prependLine(draft.value, line)
          },
          focusField: () => {},
          send: (text, outgoing) => sent.push([text, outgoing.map((image) => image.name)])
        })
        return () => null
      }
    }),
    { global: { plugins: [i18n] } }
  )
  if (!api) throw new Error('composable did not run')
  return { ...api, sent, draft, images, isShell }
}

const countOf = (text: string, part: string) => text.split(part).length - 1

describe('useComposerMarkup', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
  })

  it('should send the image with its comment naming it, and take the sent attachment away', () => {
    const shot = imageOf('a', 'shot.png')
    const { handOver, sent, draft, images } = setup({ attached: [shot] })

    expect(handOver({ sourceId: 'a', images: [shot], comment: 'blue', notes: [] }, 'send')).toBe(
      true
    )

    expect(sent).toEqual([['About [Image 1 (shot.png)]: blue', ['shot.png']]])
    expect(images.value).toEqual([])
    expect(draft.value).toBe('')
  })

  it('should send the comment alone when the image cannot go along', () => {
    const { handOver, sent } = setup()

    expect(
      handOver({ sourceId: null, images: [], comment: 'what is this?', notes: [] }, 'send')
    ).toBe(true)

    expect(sent).toEqual([['what is this?', []]])
  })

  it('should say so when there is nothing to send', () => {
    const { handOver, sent } = setup()

    expect(handOver({ sourceId: null, images: [], comment: '', notes: [] }, 'send')).toBe(false)

    expect(sent).toEqual([])
    expect(toast.error).toHaveBeenCalledWith(
      'This image cannot be sent, and without a comment there is nothing to send.'
    )
  })

  it('should turn away more images than a message takes', () => {
    const many = Array.from({ length: 11 }, (_, at) => imageOf(`i${at}`, `${at}.png`))
    const { handOver, sent } = setup()

    expect(handOver({ sourceId: null, images: many, comment: '', notes: [] }, 'send')).toBe(false)

    expect(sent).toEqual([])
    expect(toast.error).toHaveBeenCalledWith(
      'At most 10 images per message. Remove an image first.'
    )
  })

  it('should leave shell mode when a comment goes in front of the draft', () => {
    const shot = imageOf('a', 'shot.png')
    const { handOver, draft, isShell } = setup({
      attached: [shot],
      isShellAtStart: true,
      hasChips: false
    })

    expect(handOver({ sourceId: 'a', images: [], comment: 'blue', notes: [] }, 'compose')).toBe(
      true
    )

    expect(isShell.value).toBe(false)
    expect(draft.value).toBe(`About ${chipOf(1, 'shot.png')}: blue`)
  })

  it('should name a pasted image once, its notes on lines of their own under the chip', () => {
    const shot = imageOf('a', 'shot.png')
    const marked = { ...imageOf('m', 'shot.png'), isMarked: true }
    const { handOver, draft, images } = setup({ attached: [shot] })
    draft.value = `${chipOf(1, 'shot.png')} please crop\nthanks`

    const result = { sourceId: 'a', images: [marked], comment: '', notes: ['① bigger', '② bluer'] }
    expect(handOver(result, 'compose')).toBe(true)

    expect(images.value.map((image) => image.id)).toEqual(['m'])
    expect(countOf(draft.value, chipOf(1, 'shot.png'))).toBe(1)
    expect(draft.value).toBe(`${chipOf(1, 'shot.png')} please crop\n① bigger\n② bluer\nthanks`)
  })

  it('should take the notes along when the marked image is sent from the draft', () => {
    const shot = imageOf('a', 'shot.png')
    const marked = { ...imageOf('m', 'shot.png'), isMarked: true }
    const { handOver, draft, sent } = setup({ attached: [shot] })
    draft.value = `look ${chipOf(1, 'shot.png')}\nthanks`
    handOver({ sourceId: 'a', images: [marked], comment: '', notes: ['① bigger'] }, 'compose')

    handOver({ sourceId: 'm', images: [marked], comment: '', notes: [] }, 'send')

    expect(sent).toEqual([['', ['shot.png']]])
    expect(draft.value).toBe('look\nthanks')
  })
})
