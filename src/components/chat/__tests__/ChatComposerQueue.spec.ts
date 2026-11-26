import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import ChatComposerQueue from '../ChatComposerQueue.vue'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { HeldPrompt } from '@/stores/heldPrompts'

const SRC = 'data:image/png;base64,QUJD'

const held: HeldPrompt = {
  id: 'h1',
  text: '[Image 1 (shot.png)] this should be a chip',
  images: [{ id: 'i1', name: 'shot.png', mediaType: 'image/png', data: 'QUJD', src: SRC, bytes: 3 }]
}

const mountQueue = (prompts: HeldPrompt[]) => {
  const Host = defineComponent({
    setup: () => () => h(TooltipProvider, () => h(ChatComposerQueue, { prompts }))
  })
  return mount(Host, { global: { plugins: [i18n] } })
}

describe('ChatComposerQueue', () => {
  it('should show a held prompt’s image reference as a chip that names the image', () => {
    const wrapper = mountQueue([held])

    expect(wrapper.find('button[aria-label="View shot.png"]').exists()).toBe(true)
  })
})
