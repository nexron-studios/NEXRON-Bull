import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ChatCallout from '../ChatCallout.vue'
import i18n from '@/i18n'
import { provideCalloutTarget } from '@/composables/useCalloutTarget'
import type { CalloutProps } from '@/utils/callouts'

const calloutOf = (kind: CalloutProps['kind'], body: string, title: string | null = null) => ({
  kind,
  title,
  body,
  isFolded: false
})

// The pane provides the target; outside one the callout shows no buttons.
const mountInPane = (callout: CalloutProps, hasActions = true) => {
  const target = { reply: vi.fn(), send: vi.fn(), isLatestAnswer: () => true }
  const Pane = defineComponent({
    setup: () => {
      provideCalloutTarget(target)
      return () => h(ChatCallout, { callout, html: `<p>${callout.body}</p>`, hasActions })
    }
  })
  return { wrapper: mount(Pane, { global: { plugins: [i18n] } }), target }
}

const buttonNamed = (wrapper: ReturnType<typeof mount>, name: string) => {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === name)
  if (!button) throw new Error(`no button "${name}"`)
  return button
}

describe('ChatCallout', () => {
  it('should hand the question to the composer when "Antworten" is pressed', async () => {
    i18n.global.locale.value = 'de'
    const { wrapper, target } = mountInPane(calloutOf('question', 'Soll der Ordner weg?'))

    await buttonNamed(wrapper, 'Antworten').trigger('click')

    expect(target.reply).toHaveBeenCalledWith('Soll der Ordner weg?')
    expect(target.send).not.toHaveBeenCalled()
  })

  it('should quote the title of a question written on the marker line', async () => {
    i18n.global.locale.value = 'de'
    const { wrapper, target } = mountInPane(calloutOf('question', '', 'Soll der Ordner weg?'))

    await buttonNamed(wrapper, 'Antworten').trigger('click')

    expect(target.reply).toHaveBeenCalledWith('Soll der Ordner weg?')
  })

  it('should send the quoted suggestion with the answer when "Ja, mach das" is pressed', async () => {
    i18n.global.locale.value = 'de'
    const { wrapper, target } = mountInPane(calloutOf('tip', 'Soll ich preview neu bauen?'))

    await buttonNamed(wrapper, 'Ja, mach das').trigger('click')

    expect(target.send).toHaveBeenCalledWith('> Soll ich preview neu bauen?\n\nJa, mach das.')
  })

  it('should keep the buttons of a folded suggestion', () => {
    i18n.global.locale.value = 'de'
    const { wrapper } = mountInPane({ ...calloutOf('tip', 'Mergen?'), isFolded: true })

    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'Ja, mach das',
      'Nein'
    ])
  })

  it('should show no buttons on an answer that is not the latest', () => {
    i18n.global.locale.value = 'de'
    const { wrapper } = mountInPane(calloutOf('question', 'Und?'), false)

    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('should show the label of the kind when Claude wrote no title', () => {
    i18n.global.locale.value = 'de'
    const { wrapper } = mountInPane(calloutOf('warning', 'Server neu gestartet.'))

    expect(wrapper.get('[role="note"]').attributes('aria-label')).toBe('Achtung')
  })

  it('should label the list of requests and offer no buttons on it', () => {
    i18n.global.locale.value = 'de'
    const { wrapper } = mountInPane(calloutOf('changes', 'Tab-Linie: gemergt'))

    expect([
      wrapper.get('[role="note"]').attributes('aria-label'),
      wrapper.findAll('button').length
    ]).toEqual(['Aufträge', 0])
  })

  it('should show no buttons outside a chat pane', () => {
    i18n.global.locale.value = 'de'
    const wrapper = mount(ChatCallout, {
      props: { callout: calloutOf('question', 'Und?'), html: '<p>Und?</p>', hasActions: true },
      global: { plugins: [i18n] }
    })

    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
