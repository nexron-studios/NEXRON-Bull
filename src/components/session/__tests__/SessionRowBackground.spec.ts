import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import SessionRowBackground from '../SessionRowBackground.vue'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'
import type { BackgroundTask } from '@/utils/tabInsights'

const mountLine = (tasks: BackgroundTask[]) => {
  // The app provides the tooltips once at its root.
  const Root = defineComponent({
    setup: () => () => h(TooltipProvider, () => h(SessionRowBackground, { tasks }))
  })
  return mount(Root, { global: { plugins: [i18n] } })
}

/** What the row shows; screen readers get the names instead. */
const shownTextOf = (tasks: BackgroundTask[]) =>
  mountLine(tasks).find('.truncate > [aria-hidden="true"]').text()

const spokenTextOf = (tasks: BackgroundTask[]) => mountLine(tasks).find('.sr-only').text()

describe('SessionRowBackground', () => {
  const locale = i18n.global.locale.value
  beforeEach(() => {
    i18n.global.locale.value = 'de'
  })
  afterEach(() => {
    i18n.global.locale.value = locale
  })

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

  it('should give screen readers one name per task, also for an unnamed one', () => {
    const tasks = [
      { id: 'b1', description: 'Watch the release' },
      { id: 'b2', description: '' }
    ]
    expect(spokenTextOf(tasks)).toBe('Im Hintergrund: 2 Aufgaben: Watch the release, Ohne Namen')
  })
})
