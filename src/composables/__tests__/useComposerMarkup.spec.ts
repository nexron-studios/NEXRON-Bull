import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'vue-sonner'
import i18n from '@/i18n'
import type { PendingImage } from '@/utils/content'
import type { MarkNote } from '@/utils/markup'
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

const note = (number: number, text: string): MarkNote => ({ number, text })

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
  const sent: { text: string; images: { name: string; notes?: MarkNote[] }[] }[] = []
  const images = ref<PendingImage[]>([])
  const draft = ref('')
  const isShell = ref(isShellAtStart)
  let api: ReturnType<typeof useComposerMarkup> | undefined
  let removeImage: (id: string) => void = () => {}
  mount(
    defineComponent({
      setup: () => {
        const references = useImageReferences(draft, images)
        const attachments = useImageAttachments(images, ref(0), references.follow)
        images.value = attached
        if (hasChips) references.insert(attached, null)
        removeImage = attachments.remove
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
          send: (text, outgoing) =>
            sent.push({ text, images: outgoing.map(({ name, notes }) => ({ name, notes })) })
        })
        return () => null
      }
    }),
    { global: { plugins: [i18n] } }
  )
  if (!api) throw new Error('composable did not run')
  return { ...api, sent, draft, images, isShell, removeImage }
}

describe('useComposerMarkup', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
  })

  it('should send a comment as text naming the image, and take the sent attachment away', () => {
    const shot = imageOf('a', 'shot.png')
    const { handOver, sent, draft, images } = setup({ attached: [shot] })

    expect(handOver({ sourceId: 'a', images: [shot], comment: 'blue', notes: [] }, 'send')).toBe(
      true
    )

    expect(sent).toEqual([
      { text: 'About [Image 1 (shot.png)]: blue', images: [{ name: 'shot.png', notes: [] }] }
    ])
    expect(images.value).toEqual([])
    expect(draft.value).toBe('')
  })

  it('should send the comment alone when the image cannot go along', () => {
    const { handOver, sent } = setup()

    expect(
      handOver({ sourceId: null, images: [], comment: 'what is this?', notes: [] }, 'send')
    ).toBe(true)

    expect(sent).toEqual([{ text: 'what is this?', images: [] }])
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

  it('should keep the notes on the attachment and the draft as it was typed', () => {
    const shot = imageOf('a', 'shot.png')
    const marked = { ...imageOf('m', 'shot.png'), isMarked: true }
    const { handOver, draft, images } = setup({ attached: [shot] })
    draft.value = `${chipOf(1, 'shot.png')} please crop`

    const result = {
      sourceId: 'a',
      images: [marked],
      comment: '',
      notes: [note(1, 'bigger'), note(2, 'bluer')]
    }
    expect(handOver(result, 'compose')).toBe(true)

    expect(images.value.map(({ id, notes }) => ({ id, notes }))).toEqual([
      { id: 'm', notes: [note(1, 'bigger'), note(2, 'bluer')] }
    ])
    expect(draft.value).toBe(`${chipOf(1, 'shot.png')} please crop`)
  })

  it('should add a second round after the first and send every note with the image', () => {
    const shot = imageOf('a', 'shot.png')
    const first = { ...imageOf('m1', 'shot.png'), isMarked: true, markCount: 1 }
    const second = { ...imageOf('m2', 'shot.png'), isMarked: true, markCount: 2 }
    const { handOver, draft, sent } = setup({ attached: [shot] })
    draft.value = `${chipOf(1, 'shot.png')} please crop`
    handOver({ sourceId: 'a', images: [first], comment: '', notes: [note(1, 'bigger')] }, 'compose')
    // The preview hands over every note the image has: the earlier ones, then this round's.
    const both = [note(1, 'bigger'), note(2, 'bluer')]
    handOver({ sourceId: 'm1', images: [second], comment: '', notes: both }, 'compose')

    handOver({ sourceId: 'm2', images: [second], comment: '', notes: both }, 'send')

    expect(sent).toEqual([
      { text: '', images: [{ name: 'shot.png', notes: [note(1, 'bigger'), note(2, 'bluer')] }] }
    ])
    expect(draft.value).toBe('please crop')
  })

  it('should write notes changed in the preview back onto the attachment itself', () => {
    const shot = { ...imageOf('a', 'shot.png'), notes: [note(1, 'bigger'), note(2, 'bluer')] }
    const { handOver, images } = setup({ attached: [shot] })

    handOver({ sourceId: 'a', images: [], comment: '', notes: [note(2, 'much bluer')] }, 'compose')

    expect(images.value.map(({ id, notes }) => ({ id, notes }))).toEqual([
      { id: 'a', notes: [note(2, 'much bluer')] }
    ])
  })

  it('should send the words alone when the image cannot go along, and not keep them twice', () => {
    const shot = { ...imageOf('a', 'shot.png'), notes: [note(1, 'bigger')] }
    const { handOver, sent, images } = setup({ attached: [shot] })

    handOver({ sourceId: 'a', images: [], comment: '', notes: [note(1, 'bigger')] }, 'send')

    expect(sent).toEqual([{ text: '① bigger', images: [] }])
    expect(images.value.map(({ id, notes }) => ({ id, notes }))).toEqual([{ id: 'a', notes: [] }])
  })

  describe('with two images', () => {
    const one = imageOf('a', 'one.png')
    const two = imageOf('b', 'two.png')
    const markedOne = { ...imageOf('m1', 'one.png'), isMarked: true, markCount: 1 }
    const markedTwo = { ...imageOf('m2', 'two.png'), isMarked: true, markCount: 1 }
    const LINE = `${chipOf(1, 'one.png')} ${chipOf(2, 'two.png')} compare them`
    const notesOf = (images: { value: PendingImage[] }) =>
      images.value.map(({ name, notes }) => ({ name, notes }))

    it('should keep the notes with their image whichever was marked first', () => {
      const { handOver, draft, images } = setup({ attached: [one, two] })
      draft.value = LINE

      handOver(
        { sourceId: 'b', images: [markedTwo], comment: '', notes: [note(1, 'smaller')] },
        'compose'
      )
      handOver(
        { sourceId: 'a', images: [markedOne], comment: '', notes: [note(1, 'bigger')] },
        'compose'
      )

      expect(notesOf(images)).toEqual([
        { name: 'one.png', notes: [note(1, 'bigger')] },
        { name: 'two.png', notes: [note(1, 'smaller')] }
      ])
      expect(draft.value).toBe(LINE)
    })

    it("should take only the removed image's notes away", () => {
      const { handOver, draft, images, removeImage } = setup({ attached: [one, two] })
      draft.value = LINE
      handOver(
        { sourceId: 'a', images: [markedOne], comment: '', notes: [note(1, 'bigger')] },
        'compose'
      )
      handOver(
        { sourceId: 'b', images: [markedTwo], comment: '', notes: [note(1, 'smaller')] },
        'compose'
      )

      removeImage('m1')

      expect(notesOf(images)).toEqual([{ name: 'two.png', notes: [note(1, 'smaller')] }])
      expect(draft.value).toBe(`${chipOf(1, 'two.png')} compare them`)
    })

    it("should send only the image's own notes along", () => {
      const { handOver, sent, images } = setup({ attached: [one, two] })
      handOver(
        { sourceId: 'a', images: [markedOne], comment: '', notes: [note(1, 'bigger')] },
        'compose'
      )
      handOver(
        { sourceId: 'b', images: [markedTwo], comment: '', notes: [note(1, 'smaller')] },
        'compose'
      )

      handOver(
        { sourceId: 'm2', images: [markedTwo], comment: '', notes: [note(1, 'smaller')] },
        'send'
      )

      expect(sent).toEqual([
        { text: '', images: [{ name: 'two.png', notes: [note(1, 'smaller')] }] }
      ])
      expect(notesOf(images)).toEqual([{ name: 'one.png', notes: [note(1, 'bigger')] }])
    })
  })
})
