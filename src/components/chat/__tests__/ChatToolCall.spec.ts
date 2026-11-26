import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatToolCall from '../ChatToolCall.vue'
import i18n from '@/i18n'

const mountCall = (name: string, input: Record<string, unknown>) =>
  mount(ChatToolCall, { props: { name, input }, global: { plugins: [i18n] } })

const open = async (wrapper: ReturnType<typeof mountCall>) => {
  const details = wrapper.find('details')
  ;(details.element as HTMLDetailsElement).open = true
  await details.trigger('toggle')
}

describe('ChatToolCall', () => {
  it('should name the skill of a Skill call in skill orange on a tinted row, args beside it', () => {
    i18n.global.locale.value = 'en'
    const wrapper = mountCall('Skill', { args: 'high --fix', skill: 'code-review' })

    expect(wrapper.find('summary .text-act-skill').text()).toBe('code-review')
    expect(wrapper.find('summary').classes()).toContain('bg-clawd/10')
    expect(wrapper.find('summary').text()).toContain('Skillcode-reviewhigh --fix')
  })

  it('should show the args of an opened Skill call as text instead of JSON', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = mountCall('Skill', { args: 'high --fix', skill: 'code-review' })

    await open(wrapper)

    expect(wrapper.find('pre').text()).toBe('high --fix')
    expect(wrapper.text()).toContain('Arguments')
    expect(wrapper.text()).not.toContain('"skill"')
  })

  it('should say so when a Skill call passes no args', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = mountCall('Skill', { skill: 'simplify' })

    await open(wrapper)

    expect(wrapper.text()).toContain('No arguments')
  })

  it('should keep the JSON input for any other tool', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = mountCall('Mystery', { level: 2 })

    await open(wrapper)

    expect(wrapper.find('pre').text()).toBe('{\n  "level": 2\n}')
  })
})
