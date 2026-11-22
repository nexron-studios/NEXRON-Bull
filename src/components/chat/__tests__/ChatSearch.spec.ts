import { mount, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatSearch from '../ChatSearch.vue'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ChatSearchState } from '@/composables/useChatSearch'

const search: ChatSearchState = {
  query: '',
  isOpen: true,
  isListOpen: true,
  isSettled: true,
  active: 0,
  hits: [],
  ticks: [],
  open: vi.fn(),
  close: vi.fn(),
  type: vi.fn(),
  jump: vi.fn(),
  step: vi.fn(),
  moveActive: vi.fn()
}

// A real click: onClickOutside starts on pointerdown and closes on the click that follows. It
// takes one click per task, so the next click waits for a new one, as a person's would.
const clickOn = async (target: Element) => {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

let wrapper: VueWrapper | null = null
const mountSearch = () => {
  const toggle = document.createElement('button')
  toggle.setAttribute('data-search-button', '')
  const elsewhere = document.createElement('p')
  elsewhere.textContent = 'Claude hat das Deployment gestartet.'
  document.body.append(toggle, elsewhere)
  wrapper = mount(TooltipProvider, {
    slots: { default: () => [h(ChatSearch, { search })] },
    attachTo: document.body,
    global: { plugins: [i18n] }
  })
  const dismissals = () => wrapper?.findComponent(ChatSearch).emitted('dismiss')?.length ?? 0
  return { input: wrapper.find('input').element, toggle, elsewhere, dismissals }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

describe('ChatSearch', () => {
  it('should be dismissed by a click next to the field', async () => {
    const { elsewhere, dismissals } = mountSearch()

    await clickOn(elsewhere)

    expect(dismissals()).toBe(1)
  })

  it('should stay open for a click inside the field or on the magnifier', async () => {
    const { input, toggle, elsewhere, dismissals } = mountSearch()

    await clickOn(input)
    await clickOn(toggle)
    await clickOn(elsewhere)

    expect(dismissals()).toBe(1)
  })

  it('should stay open when the click ends a text selection in the chat', async () => {
    const { elsewhere, dismissals } = mountSearch()
    window.getSelection()?.selectAllChildren(elsewhere)

    await clickOn(elsewhere)

    expect(dismissals()).toBe(0)
  })
})
