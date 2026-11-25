import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'vue-sonner'
import i18n from '@/i18n'
import { flattenImage } from '@/lib/imageExport'
import type { LightboxImage } from '@/utils/attachments'
import type { MarkupHandoff, MarkupResult } from '../useMarkupTarget'
import { useLightboxActions } from '../useLightboxActions'
import { useProvideMarkup } from '../useMarkup'

vi.mock('vue-sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/imageExport', () => ({
  ImageTooLargeError: class extends Error {},
  copyImage: vi.fn(),
  downloadImage: vi.fn(),
  flattenImage: vi.fn()
}))

const SRC = 'data:image/png;base64,QUJD'
const attached: LightboxImage = { id: 'a', src: SRC, name: 'shot.png', bytes: 3 }
const fromHistory: LightboxImage = { src: SRC, name: 'Bild 1', bytes: 3 }

const setup = (image: LightboxImage) => {
  const target = vi.fn((_result: MarkupResult, _handoff: MarkupHandoff) => true)
  const onApplied = vi.fn()
  let api:
    | {
        markup: ReturnType<typeof useProvideMarkup>
        actions: ReturnType<typeof useLightboxActions>
      }
    | undefined
  mount(
    defineComponent({
      setup: () => {
        const markup = useProvideMarkup()
        const actions = useLightboxActions({ current: ref(image), target, markup, onApplied })
        api = { markup, actions }
        return () => null
      }
    }),
    { global: { plugins: [i18n] } }
  )
  if (!api) throw new Error('composable did not run')
  return { ...api, target, onApplied }
}

describe('useLightboxActions', () => {
  beforeEach(() => {
    vi.mocked(flattenImage).mockClear()
    vi.mocked(toast.warning).mockClear()
  })

  it('should hand a comment alone on an attachment over without touching the image', async () => {
    const { markup, actions, target, onApplied } = setup(attached)
    markup.comment.value = '  make the button blue '
    await actions.apply()
    expect(target).toHaveBeenCalledWith(
      { sourceId: 'a', images: [], comment: 'make the button blue' },
      'compose'
    )
    expect(flattenImage).not.toHaveBeenCalled()
    expect(onApplied).toHaveBeenCalledOnce()
  })

  it('should send an attachment along with a comment alone when sent right away', async () => {
    const { markup, actions, target, onApplied } = setup(attached)
    markup.comment.value = 'make the button blue'
    await actions.apply('send')
    expect(target).toHaveBeenCalledWith(
      {
        sourceId: 'a',
        images: [
          {
            id: 'a',
            name: 'shot.png',
            src: SRC,
            bytes: 3,
            isMarked: undefined,
            mediaType: 'image/png',
            data: 'QUJD'
          }
        ],
        comment: 'make the button blue'
      },
      'send'
    )
    expect(onApplied).toHaveBeenCalledOnce()
  })

  it('should bring a history image along as it is when only a comment was written', async () => {
    const { markup, actions, target } = setup(fromHistory)
    markup.comment.value = 'what is this?'
    await actions.apply()
    expect(target.mock.calls[0]?.[0].images).toMatchObject([
      { name: 'Bild 1', mediaType: 'image/png', data: 'QUJD' }
    ])
    expect(flattenImage).not.toHaveBeenCalled()
  })

  it('should warn once before leaving drops a comment', () => {
    const { markup, actions } = setup(attached)
    markup.comment.value = 'note'
    expect(actions.mayLeave()).toBe(false)
    expect(actions.mayLeave()).toBe(true)
  })

  it('should let marking stop without a warning when only a comment was written', () => {
    const { markup, actions } = setup(attached)
    markup.comment.value = 'note'
    expect(actions.mayStopMarking()).toBe(true)
    expect(toast.warning).not.toHaveBeenCalled()
  })
})
