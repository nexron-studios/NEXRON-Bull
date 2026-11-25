import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import ChatTextPieces from '../ChatTextPieces.vue'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { LightboxImage } from '@/utils/attachments'
import type { TextPiece } from '@/utils/textPieces'

const SRC = 'data:image/png;base64,QUJD'

const pieces: TextPiece[] = [
  { text: 'Siehe ', mark: null },
  { text: 'Bild 2 · shot.png', mark: { kind: 'image', n: 2, name: 'shot.png', src: SRC } }
]

const images: LightboxImage[] = [
  { src: SRC, name: 'first.png', bytes: 3 },
  { src: SRC, name: 'shot.png', bytes: 3 }
]

const mountPieces = (props: { pieces: TextPiece[]; images?: LightboxImage[] }) => {
  const opened: number[] = []
  const Host = defineComponent({
    setup: () => () =>
      h(TooltipProvider, () =>
        h(ChatTextPieces, { ...props, onOpen: (n: number) => opened.push(n) })
      )
  })
  return { wrapper: mount(Host, { global: { plugins: [i18n] } }), opened }
}

describe('ChatTextPieces', () => {
  it('should open the image a sent chip names when it is clicked', async () => {
    const { wrapper, opened } = mountPieces({ pieces, images })

    await wrapper.get('button[aria-label="View shot.png"]').trigger('click')

    expect(opened).toEqual([2])
  })

  it('should draw the chip as a picture only when no images are given', () => {
    const { wrapper } = mountPieces({ pieces })

    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.get('[data-image-ref="2"]').text()).toContain('Image 2')
  })
})
