import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ChatUserMessageActions from '../ChatUserMessageActions.vue'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { providePromptEdit, type PromptEditState } from '@/composables/usePromptEdit'

const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText }))
// Copies the way the app window does; the browser's fallback is `navigator.clipboard`.
vi.mock('@/lib/platform', () => ({ isDesktopApp: () => true }))

// The app shares one minute clock that started with the first test, so "sent" is set from now.
const FIVE_AND_A_HALF_MINUTES_MS = 5.5 * 60 * 1000
const SENT_AT = new Date(Date.now() - FIVE_AND_A_HALF_MINUTES_MS).toISOString()

// The pane provides the edit target; outside one the row shows only time and copy.
const mountInPane = (state: PromptEditState, at: string | null = SENT_AT) => {
  const target = { stateOf: vi.fn(() => state), edit: vi.fn() }
  const Pane = defineComponent({
    setup: () => {
      providePromptEdit(target)
      return () =>
        h(TooltipProvider, () =>
          h(ChatUserMessageActions, { uuid: 'p1', text: 'Mach den Knopf blau', at })
        )
    }
  })
  return { wrapper: mount(Pane, { global: { plugins: [i18n] } }), target }
}

const buttonLabelled = (wrapper: ReturnType<typeof mount>, label: string) => {
  const button = wrapper.find(`button[aria-label="${label}"]`)
  if (!button.exists()) throw new Error(`no button "${label}"`)
  return button
}

describe('ChatUserMessageActions', () => {
  it('should open the rewind on this prompt when "Bearbeiten" is pressed', async () => {
    i18n.global.locale.value = 'de'
    const { wrapper, target } = mountInPane('ready')

    await buttonLabelled(wrapper, 'Bearbeiten').trigger('click')

    expect(target.stateOf).toHaveBeenCalledWith('p1')
    expect(target.edit).toHaveBeenCalledWith('p1')
  })

  it('should say why a prompt without rewind point cannot be edited', async () => {
    i18n.global.locale.value = 'de'
    const { wrapper, target } = mountInPane('no_point')
    const label = 'Zu dieser Nachricht gibt es keinen Punkt zum Zurückspulen'

    await buttonLabelled(wrapper, label).trigger('click')

    expect(buttonLabelled(wrapper, label).attributes('aria-disabled')).toBe('true')
    expect(target.edit).not.toHaveBeenCalled()
  })

  it('should copy the prompt text', async () => {
    i18n.global.locale.value = 'de'
    const { wrapper } = mountInPane('ready')

    await buttonLabelled(wrapper, 'Kopieren').trigger('click')

    expect(writeText).toHaveBeenCalledWith('Mach den Knopf blau')
  })

  it('should show when the prompt was sent', () => {
    i18n.global.locale.value = 'de'
    const { wrapper } = mountInPane('ready')

    expect(wrapper.find('time').attributes('datetime')).toBe(SENT_AT)
    expect(wrapper.find('time span[aria-hidden="true"]').text()).toBe('vor 5 Min.')
  })

  it('should leave out the time when the transcript has no readable date', () => {
    i18n.global.locale.value = 'de'
    const { wrapper } = mountInPane('ready', 'kein Datum')

    expect(wrapper.find('time').exists()).toBe(false)
    expect(buttonLabelled(wrapper, 'Kopieren').exists()).toBe(true)
  })
})
