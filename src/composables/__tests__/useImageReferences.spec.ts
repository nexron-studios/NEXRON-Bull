import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { PendingImage } from '@/utils/content'
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

const shot = imageOf('a', 'shot.png')
const logo = imageOf('b', 'logo.png')

/** As the composer renders a reference: no line break inside, so no-break spaces and hyphens. */
const unbroken = (text: string) =>
  text.replace(/\[[^\]]*\]/g, (token) => token.replaceAll(' ', '\u00a0').replaceAll('-', '\u2011'))

// The composer's wiring: attachments tell the references when they rearrange.
const setup = (text: string, attached: PendingImage[]) => {
  const draft = ref(text)
  const images = ref(attached)
  let api:
    | {
        references: ReturnType<typeof useImageReferences>
        attachments: ReturnType<typeof useImageAttachments>
      }
    | undefined
  mount(
    defineComponent({
      setup: () => {
        const references = useImageReferences(draft, images)
        const attachments = useImageAttachments(images, ref(0), references.follow)
        api = { references, attachments }
        return () => null
      }
    }),
    { global: { plugins: [i18n] } }
  )
  if (!api) throw new Error('composable did not run')
  return { draft, images, ...api }
}

describe('useImageReferences', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'de'
  })

  it('should insert a reference at the selection and give the caret after it', () => {
    const { draft, references } = setup('see this', [shot])
    expect(references.insert([shot], { start: 4, end: 4 })).toBe(24)
    expect(draft.value).toBe(unbroken('see [Bild 1 (shot.png)] this'))
  })

  it('should append the reference when the field never had the caret', () => {
    const { draft, references } = setup('see', [shot])
    references.insert([shot], null)
    expect(draft.value).toBe(unbroken('see [Bild 1 (shot.png)] '))
  })

  it('should drop the reference when its chip is removed and renumber the others', () => {
    const { draft, attachments } = setup('[Bild 1 (shot.png)] vs [Bild 2 (logo.png)]', [shot, logo])
    attachments.remove('a')
    expect(draft.value).toBe(unbroken('vs [Bild 1 (logo.png)]'))
  })

  it('should renumber references when the chips are dragged into a new order', () => {
    const { draft, attachments } = setup('[Bild 1 (shot.png)] vs [Bild 2 (logo.png)]', [shot, logo])
    attachments.reorder([logo, shot])
    expect(draft.value).toBe(unbroken('[Bild 2 (shot.png)] vs [Bild 1 (logo.png)]'))
  })

  it('should point the reference at the marked copy that replaces its image', () => {
    const { draft, attachments } = setup('fix [Bild 1 (shot.png)]', [shot])
    const marked = { ...imageOf('m', 'shot.png'), isMarked: true }
    attachments.placeMarkedImages('a', [marked, shot])
    expect(draft.value).toBe(unbroken('fix [Bild 1 (shot.png)]'))
    attachments.move('m', 1)
    expect(draft.value).toBe(unbroken('fix [Bild 2 (shot.png)]'))
  })

  it('should highlight only references that name an attachment', () => {
    const { references } = setup(unbroken('[Bild 1 (shot.png)] [Bild 2 (gone.png)]'), [shot])
    expect(references.highlights.value).toEqual([
      {
        start: 0,
        end: 19,
        kind: 'image',
        n: 1,
        name: 'shot.png',
        src: 'data:image/png;base64,QUJD'
      }
    ])
  })

  it('should give no chip to a reference typed with plain spaces, as it could wrap inside', () => {
    const { references } = setup('[Bild 1 (shot.png)]', [shot])
    expect(references.highlights.value).toEqual([])
  })

  it('should select the whole reference on Backspace so it goes as one unit', () => {
    const { draft, references } = setup('see [Bild 1 (shot.png)] now', [shot])
    const field = document.createElement('textarea')
    field.value = draft.value
    field.setSelectionRange(23, 23)
    references.selectWhole(new KeyboardEvent('keydown', { key: 'Backspace' }), field)
    expect([field.selectionStart, field.selectionEnd]).toEqual([4, 23])
  })

  it('should leave word-wise deleting to the browser', () => {
    const { draft, references } = setup('see [Bild 1 (shot.png)] now', [shot])
    const field = document.createElement('textarea')
    field.value = draft.value
    field.setSelectionRange(23, 23)
    references.selectWhole(new KeyboardEvent('keydown', { key: 'Backspace', altKey: true }), field)
    expect([field.selectionStart, field.selectionEnd]).toEqual([23, 23])
  })
})
