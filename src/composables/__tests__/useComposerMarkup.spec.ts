import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'vue-sonner'
import i18n from '@/i18n'
import type { PendingImage } from '@/utils/content'
import { useComposerMarkup } from '../useComposerMarkup'
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

const setup = (attached: PendingImage[] = [], isShellAtStart = false) => {
  const sent: [string, string[]][] = []
  const removed: string[] = []
  const images = ref(attached)
  const draft = ref('')
  const isShell = ref(isShellAtStart)
  let api: ReturnType<typeof useComposerMarkup> | undefined
  mount(
    defineComponent({
      setup: () => {
        api = useComposerMarkup({
          images,
          isShell,
          references: useImageReferences(draft, images),
          placeMarkedImages: () => true,
          remove: (id) => removed.push(id),
          prependComment: (line) => {
            draft.value = line
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
  return { ...api, sent, removed, draft, isShell }
}

describe('useComposerMarkup', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
  })

  it('should send the image with its comment naming it, and take the sent attachment away', () => {
    const shot = imageOf('a', 'shot.png')
    const { handOver, sent, removed } = setup([shot])

    expect(handOver({ sourceId: 'a', images: [shot], comment: 'blue' }, 'send')).toBe(true)

    expect(sent).toEqual([['About [Image 1 (shot.png)]: blue', ['shot.png']]])
    expect(removed).toEqual(['a'])
  })

  it('should send the comment alone when the image cannot go along', () => {
    const { handOver, sent } = setup()

    expect(handOver({ sourceId: null, images: [], comment: 'what is this?' }, 'send')).toBe(true)

    expect(sent).toEqual([['what is this?', []]])
  })

  it('should say so when there is nothing to send', () => {
    const { handOver, sent } = setup()

    expect(handOver({ sourceId: null, images: [], comment: '' }, 'send')).toBe(false)

    expect(sent).toEqual([])
    expect(toast.error).toHaveBeenCalledWith(
      'This image cannot be sent, and without a comment there is nothing to send.'
    )
  })

  it('should turn away more images than a message takes', () => {
    const many = Array.from({ length: 11 }, (_, at) => imageOf(`i${at}`, `${at}.png`))
    const { handOver, sent } = setup()

    expect(handOver({ sourceId: null, images: many, comment: '' }, 'send')).toBe(false)

    expect(sent).toEqual([])
    expect(toast.error).toHaveBeenCalledWith(
      'At most 10 images per message. Remove an image first.'
    )
  })

  it('should leave shell mode when a comment goes in front of the draft', () => {
    const shot = imageOf('a', 'shot.png')
    const { handOver, draft, isShell } = setup([shot], true)

    expect(handOver({ sourceId: 'a', images: [], comment: 'blue' }, 'compose')).toBe(true)

    expect(isShell.value).toBe(false)
    // In the draft a reference keeps no-break spaces, so its chip never wraps.
    expect(draft.value).toBe('About [Image\u00a01\u00a0(shot.png)]: blue')
  })
})
