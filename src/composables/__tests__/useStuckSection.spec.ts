import { defineComponent, h, nextTick, ref, useTemplateRef } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { useStuckSection } from '../useStuckSection'

enableAutoUnmount(afterEach)

/** jsdom lays nothing out: each section gets the offset a browser would measure. */
const placeSection = (section: Element, top: number) =>
  Object.defineProperty(section, 'offsetTop', { configurable: true, value: top })

const mountSections = async (tops: Record<string, number>) => {
  const scrollTop = ref(0)
  let stuck: ReturnType<typeof useStuckSection> | undefined
  const host = defineComponent({
    setup: () => {
      const area = useTemplateRef<HTMLElement>('area')
      stuck = useStuckSection(area, scrollTop)
      return () =>
        h(
          'div',
          { ref: 'area' },
          Object.keys(tops).map((name) => h('section', { 'data-section': name }))
        )
    }
  })
  const wrapper = mount(host, { attachTo: document.body })
  for (const section of wrapper.element.children)
    placeSection(section, tops[(section as HTMLElement).dataset.section ?? ''])
  await nextTick()
  if (!stuck) throw new Error('no stuck section')
  return { stuck, scrollTop, area: wrapper.element as HTMLElement }
}

describe('useStuckSection', () => {
  it('should stick no section while the area rests at its start', async () => {
    const { stuck } = await mountSections({ needs: 0, done: 120 })

    expect(stuck.value).toBe(null)
  })

  it('should stick the section scrolled into', async () => {
    const { stuck, scrollTop } = await mountSections({ needs: 0, done: 120 })

    scrollTop.value = 150
    await nextTick()

    expect(stuck.value).toBe('done')
  })

  it('should follow a section that moved without a scroll', async () => {
    const { stuck, scrollTop, area } = await mountSections({ needs: 0, done: 120 })
    scrollTop.value = 150
    await nextTick()

    placeSection(area.children[1], 200)
    area.children[0].append(document.createElement('p'))
    await new Promise((resolve) => setTimeout(resolve))

    expect(stuck.value).toBe('needs')
  })
})
