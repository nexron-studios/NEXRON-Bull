import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCopyHintStore } from '@/stores/copyHint'
import { useCopyOnSelect } from '../useCopyOnSelect'

const { writeText } = vi.hoisted(() => ({ writeText: vi.fn(() => Promise.resolve()) }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText }))

const Page = defineComponent({
  setup: () => {
    useCopyOnSelect()
    return () =>
      h('div', [
        h('p', { id: 'answer' }, 'Claude sagt Hallo'),
        h('div', { id: 'field', contenteditable: 'true' }, 'mein Entwurf'),
        h('div', { id: 'composer' }, [h('textarea', { id: 'prompt' }, 'Neuer Prompt')])
      ])
  }
})

const select = (node: Node, start: number, end: number) => {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** jsdom has no PointerEvent; the composable only reads these fields. */
const release = (pointerType = 'mouse', button = 0) => {
  const event = new MouseEvent('pointerup', { bubbles: true, button, clientX: 40, clientY: 60 })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  document.dispatchEvent(event)
  return new Promise((resolve) => setTimeout(resolve))
}

describe('useCopyOnSelect', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    writeText.mockClear()
  })

  afterEach(() => {
    window.getSelection()?.removeAllRanges()
  })

  it('should copy a mouse selection in the chat once and show the hint where it ended', async () => {
    const wrapper = mount(Page, { attachTo: document.body })
    const text = wrapper.get('#answer').element.firstChild as Node
    select(text, 12, 17)

    await release()
    await release()

    expect([writeText.mock.calls, useCopyHintStore().hint]).toEqual([
      [['Hallo']],
      { id: 1, x: 40, y: 60 }
    ])
    wrapper.unmount()
  })

  it('should leave the clipboard alone for touch, a blank selection and fields', async () => {
    const wrapper = mount(Page, { attachTo: document.body })
    const text = wrapper.get('#answer').element.firstChild as Node
    const draft = wrapper.get('#field').element.firstChild as Node

    select(text, 0, 6)
    await release('touch')
    select(text, 6, 7)
    await release()
    select(draft, 0, 4)
    await release()
    // How Blink reports a selection inside a textarea: the field's parent plus an index.
    const prompt = wrapper.get('#prompt').element as HTMLTextAreaElement
    prompt.focus()
    select(wrapper.get('#composer').element, 0, 1)
    await release()

    expect(writeText).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
