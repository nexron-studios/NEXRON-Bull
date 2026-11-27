import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PanelFoldedList from '../PanelFoldedList.vue'
import i18n from '@/i18n'

enableAutoUnmount(afterEach)

const mountList = (props: { isExpanded: boolean; isCapped?: boolean }) =>
  mount(PanelFoldedList, {
    props: { isFoldable: true, hiddenCount: 3, controls: 'list', ...props },
    slots: { default: '<ul id="list"><li>Row</li></ul>' },
    global: { plugins: [i18n] }
  })

const scrollBoxOf = (wrapper: ReturnType<typeof mountList>) =>
  wrapper.find('#list').element.parentElement

describe('PanelFoldedList', () => {
  it('scrolls inside a fixed height once opened', () => {
    const wrapper = mountList({ isExpanded: true })

    expect(scrollBoxOf(wrapper)?.classList.contains('max-h-72')).toBe(true)
  })

  it('grows with its rows when it is not capped', () => {
    const wrapper = mountList({ isExpanded: true, isCapped: false })

    expect(scrollBoxOf(wrapper)?.classList.contains('max-h-72')).toBe(false)
  })
})
