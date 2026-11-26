import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatStatusIcon from '../ChatStatusIcon.vue'
import i18n from '@/i18n'

const iconOf = (props: InstanceType<typeof ChatStatusIcon>['$props']) =>
  mount(ChatStatusIcon, { props, global: { plugins: [i18n] } }).find('svg')

describe('ChatStatusIcon', () => {
  it('should turn the icon of a working chat', () => {
    expect(iconOf({ status: 'working' }).classes()).toContain('animate-spin')
  })

  it('should hold the icon of a working chat still where a line says what Claude does', () => {
    const icon = iconOf({ status: 'working', isStill: true })
    expect([icon.classes('animate-spin'), icon.classes('text-warning')]).toEqual([false, true])
  })
})
