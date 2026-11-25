import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import SessionRowBackground from '../SessionRowBackground.vue'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'
import type { BackgroundTask } from '@/utils/tabInsights'

const shownTextOf = (tasks: BackgroundTask[]) => {
  i18n.global.locale.value = 'de'
  // The app provides the tooltips once at its root.
  const Root = defineComponent({
    setup: () => () => h(TooltipProvider, () => h(SessionRowBackground, { tasks }))
  })
  const wrapper = mount(Root, { global: { plugins: [i18n] } })
  return wrapper.find('[aria-hidden="true"]').exists()
    ? wrapper.find('[aria-hidden="true"]').text()
    : wrapper.text()
}

describe('SessionRowBackground', () => {
  it('should name the one task that runs', () => {
    const tasks = [{ id: 'b1', description: 'Follow act video generation until done' }]
    expect(shownTextOf(tasks)).toBe('Im Hintergrund: Follow act video generation until done')
  })

  it('should count several tasks', () => {
    const tasks = [
      { id: 'b1', description: 'Follow act video generation until done' },
      { id: 'b2', description: 'Watch the release' }
    ]
    expect(shownTextOf(tasks)).toBe('Im Hintergrund: 2 Aufgaben')
  })

  it('should count a task Claude gave no name', () => {
    expect(shownTextOf([{ id: 'b1', description: '' }])).toBe('Im Hintergrund: 1 Aufgabe')
  })
})
